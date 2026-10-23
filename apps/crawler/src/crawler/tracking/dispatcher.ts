import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import { SNAPSHOT_BATCH_QUEUE, type SnapshotBatchJobData } from "../snapshot/worker";
import type { CrawlerMq, CrawlerQueue } from "../shared/types";
import type { ITrackingRepository } from "./repository.interface";

const CHUNK_SIZE = 30; // Max aids per Bilibili medialist API request
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes in-flight lease

export interface TrackingDispatcherOptions {
	intervalMs?: number;
	maxPerTick?: number;
}

export class TrackingDispatcher {
	private timer: ReturnType<typeof setInterval> | undefined;
	private isRunning = false;
	private isTicking = false;
	private readonly queue: CrawlerQueue<SnapshotBatchJobData>;
	private readonly intervalMs: number;
	private readonly maxPerTick: number;

	constructor(
		private readonly trackingRepo: ITrackingRepository,
		mq: CrawlerMq,
		options: TrackingDispatcherOptions = {}
	) {
		this.queue = mq.createQueue<SnapshotBatchJobData>(SNAPSHOT_BATCH_QUEUE);
		this.intervalMs = options.intervalMs ?? 1_000;
		this.maxPerTick = options.maxPerTick ?? 300;
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
		});
	}

	stop(): void {
		if (!this.isRunning) return;
		this.isRunning = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		appLogger.info("TrackingDispatcher stopped", { component: "tracking-dispatcher" });
	}

	async tick(now = new Date()): Promise<number> {
		if (this.isTicking) return 0;
		this.isTicking = true;
		try {
			return await traceTask("tracking.dispatcher.tick", async () => {
				const nowInstant = toInstant(now);
				const dueVideos = await this.trackingRepo.findDueVideos(
					this.maxPerTick,
					nowInstant
				);
				if (dueVideos.length === 0) return 0;

				const allAids = dueVideos.map((v) => v.aid);
				// Lease videos forward to prevent re-dispatching before worker finishes
				const leaseInstant = toInstant(new Date(now.getTime() + LEASE_DURATION_MS));
				await this.trackingRepo.postponeSchedule(allAids, leaseInstant);

				// Group into chunks of up to 30
				const chunks: bigint[][] = [];
				for (let i = 0; i < allAids.length; i += CHUNK_SIZE) {
					chunks.push(allAids.slice(i, i + CHUNK_SIZE));
				}

				for (const chunk of chunks) {
					// Use highest priority in chunk (min number)
					const chunkAids = new Set(chunk);
					const minPriority = dueVideos
						.filter((v) => chunkAids.has(v.aid))
						.reduce((min, v) => Math.min(min, v.priority), 3);

					await this.queue.add(
						"process-batch",
						{ aids: chunk.map((a) => a.toString()) },
						{ priority: minPriority }
					);
				}

				appLogger.info("Dispatched snapshot batch jobs", {
					component: "tracking-dispatcher",
					videosCount: allAids.length,
					chunksCount: chunks.length,
				});

				return allAids.length;
			});
		} finally {
			this.isTicking = false;
		}
	}
}
