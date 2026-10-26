import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import { SNAPSHOT_BATCH_QUEUE, type SnapshotBatchJobData } from "../snapshot/worker";
import type { CrawlerJobCounts, CrawlerMq, CrawlerQueue } from "../shared/types";
import { resolveTrackingPolicy } from "./policy";
import type { ITrackingRepository } from "./repository.interface";
import type { TrackingPolicyConfig } from "./types";

const CHUNK_SIZE = 30; // Max aids per Bilibili medialist API request
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes in-flight lease

export interface TrackingDispatcherOptions extends TrackingPolicyConfig {
	intervalMs?: number;
	maxPerTick?: number;
	leaseDurationMs?: number;
	/** Backpressure ceiling: `active + waiting` jobs the queue may already hold. */
	queueCap?: number;
}

export class TrackingDispatcher {
	private timer: ReturnType<typeof setInterval> | undefined;
	private isRunning = false;
	private isTicking = false;
	private readonly queue: CrawlerQueue<SnapshotBatchJobData>;
	private readonly intervalMs: number;
	private readonly maxPerTick: number;
	private readonly leaseDurationMs: number;
	private readonly policy: Required<TrackingPolicyConfig>;

	constructor(
		private readonly trackingRepo: ITrackingRepository,
		mq: CrawlerMq,
		options: TrackingDispatcherOptions = {}
	) {
		this.queue = mq.createQueue<SnapshotBatchJobData>(SNAPSHOT_BATCH_QUEUE);
		this.intervalMs = options.intervalMs ?? 1_000;
		this.maxPerTick = options.maxPerTick ?? 300;
		this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
		this.policy = resolveTrackingPolicy(options);
	}

	/** Effective `active + waiting` cap; exposed for operators/tests. */
	get queueCap(): number {
		return this.policy.queueCap;
	}

	start(): void {
		if (this.isRunning) return;
		this.isRunning = true;
		this.timer = setInterval(() => {
			void this.tick().catch((error) => {
				appLogger.error("TrackingDispatcher tick uncaught error", {
					component: "tracking-dispatcher",
					error,
				});
			});
		}, this.intervalMs);
		appLogger.info("TrackingDispatcher started", {
			component: "tracking-dispatcher",
			intervalMs: this.intervalMs,
			queueCap: this.queueCap,
		});
	}

	stop(): void {
		if (!this.isRunning) return;
		this.isRunning = false;
		if (this.timer) {
			this.clearTimer();
		}
		appLogger.info("TrackingDispatcher stopped", { component: "tracking-dispatcher" });
	}

	async tick(now = new Date()): Promise<number> {
		if (this.isTicking) return 0;
		this.isTicking = true;
		try {
			return await traceTask("tracking.dispatcher.tick", async () => {
				// Backpressure first: pulling from the DB only to sit in Redis would
				// turn a Bilibili hiccup into unbounded queue growth.
				const counts = await this.queue.getJobCounts();
				const inFlight = counts.active + counts.waiting;
				const capacity = this.queueCap - inFlight;
				if (capacity <= 0) {
					appLogger.warn("TrackingDispatcher is backpressured by the queue cap", {
						component: "tracking-dispatcher",
						queueCap: this.queueCap,
						active: counts.active,
						waiting: counts.waiting,
					});
					return 0;
				}

				const claimLimit = Math.min(this.maxPerTick, capacity);
				const claimed = await this.trackingRepo.claimDueVideos(
					toInstant(now),
					claimLimit,
					this.leaseDurationMs
				);
				if (claimed.length === 0) return 0;

				// Group into chunks of up to 30 (one Bilibili medialist request each).
				const chunks: Array<{ aids: bigint[]; priority: number }> = [];
				for (let i = 0; i < claimed.length; i += CHUNK_SIZE) {
					const slice = claimed.slice(i, i + CHUNK_SIZE);
					chunks.push({
						aids: slice.map((video) => video.aid),
						priority: slice.reduce((min, video) => Math.min(min, video.priority), 5),
					});
				}

				let dispatched = 0;
				try {
					for (const chunk of chunks) {
						await this.queue.add(
							"process-batch",
							{ aids: chunk.aids.map((aid) => aid.toString()) },
							{ priority: chunk.priority }
						);
						dispatched += chunk.aids.length;
					}
				} catch (error) {
					// Anything that never made it onto the queue must not keep its
					// lease, or it would be invisible until the lease expires.
					const undispatched = claimed.slice(dispatched).map((video) => video.aid);
					await this.trackingRepo.releaseLeases(undispatched);
					throw error;
				}

				appLogger.info("Dispatched snapshot batch jobs", {
					component: "tracking-dispatcher",
					videosCount: dispatched,
					chunksCount: chunks.length,
					queueActive: counts.active,
					queueWaiting: counts.waiting,
					queueCap: this.queueCap,
				});

				return dispatched;
			});
		} finally {
			this.isTicking = false;
		}
	}

	/** Queue depth snapshot, used by the stats collector. */
	async inspectQueue(): Promise<CrawlerJobCounts> {
		return this.queue.getJobCounts();
	}

	private clearTimer(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}
