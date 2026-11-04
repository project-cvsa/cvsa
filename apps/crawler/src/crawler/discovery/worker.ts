import { RetryLaterError } from "../shared/retryLater";
import { outcomeOfError } from "../stats/outcome";
import { AppError, type DiscoveryJobProgress, type RetryPolicy } from "@cvsa/contracts";
import { UnrecoverableError } from "bullmq";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { JobsOptions } from "bullmq";
import type { BilibiliClient } from "../bilibili";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { CrawlerMq, CrawlerQueue, CrawlerWorker } from "../shared/types";
import type { ITrackingRepository } from "../tracking/repository.interface";
import type { VideoClassifierClient } from "./classifier";
import { DiscoveryCandidateEvaluator } from "./evaluator";
import { DiscoveryFilterService } from "./filter";
import { RELATED_DISCOVERY_ENABLED } from "./flags";
import { RelationExtractor } from "./relationExtractor";
import type { IDiscoveryRepository } from "./repository.interface";
import { DEFAULT_KEYWORDS, SearchRover } from "./searchRover";
import type { CandidateSource, DiscoveryOrigin, SearchRoverConfig } from "./types";

export type DiscoveryJobData = (
	| {
			type: "search-sweep";
			mode?: "incremental" | "deep";
			config?: Partial<SearchRoverConfig>;
			offset?: number;
			_timeoutMs?: number;
	  }
	| {
			type: "fetch-video-details";
			aid: string;
			source: "search" | "related" | "manual" | "hot_sample";
			sourceAid?: string;
			position?: number;
			origin?: DiscoveryOrigin;
	  }
	| { type: "active-discovery"; aid: string }
	| { type: "hot-sample"; limit?: number; timeWindowDays?: number }
) & { failureAttempts?: number; asOf?: number; completedQueries?: string[] };

export const DISCOVERY_QUEUE_NAME = "crawler-discovery";

/** Ordinary failures use bounded retries; throttling is delayed without consuming attempts. */
export const DISCOVERY_QUEUE_JOB_OPTIONS: JobsOptions = {
	attempts: 1,
};

/** Builds the discovery queue with the retry policy above applied as its default. */
export function createDiscoveryQueue(mq: CrawlerMq): CrawlerQueue<DiscoveryJobData> {
	return mq.createQueue<DiscoveryJobData>(DISCOVERY_QUEUE_NAME, DISCOVERY_QUEUE_JOB_OPTIONS);
}

const DEFAULT_HOT_SAMPLE_LIMIT = 10;

export class DiscoveryPipelineProcessor {
	readonly filterService: DiscoveryFilterService;
	readonly relationExtractor: RelationExtractor;
	readonly searchRover: SearchRover;
	readonly evaluator: DiscoveryCandidateEvaluator;

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly discoveryRepo: IDiscoveryRepository,
		private readonly trackingRepo: ITrackingRepository,
		private readonly discoveryQueue: CrawlerQueue<DiscoveryJobData>,
		filterService?: DiscoveryFilterService,
		classifier?: VideoClassifierClient,
		stats: StatsRecorder = createNoopStatsRecorder(),
		private readonly relatedDiscoveryEnabled = RELATED_DISCOVERY_ENABLED
	) {
		this.filterService = filterService ?? new DiscoveryFilterService();
		this.relationExtractor = new RelationExtractor(discoveryRepo);
		this.searchRover = new SearchRover(bilibiliClient, discoveryRepo);
		this.evaluator = new DiscoveryCandidateEvaluator(
			bilibiliClient,
			discoveryRepo,
			trackingRepo,
			this.filterService,
			classifier,
			stats
		);
	}

	async processJob(
		data: DiscoveryJobData,
		report?: (progress: DiscoveryJobProgress) => Promise<void>,
		checkpoint?: (offset: number, key?: string) => Promise<void>
	): Promise<void> {
		let target: string | null = null;
		if ("aid" in data) {
			target = String(data.aid);
		} else if (data.type === "search-sweep") {
			const keywords =
				data.config?.keywords ??
				this.filterService.getConfig().searchKeywords ??
				DEFAULT_KEYWORDS;
			target = keywords.join(", ");
		}
		await report?.({
			stage:
				data.type === "search-sweep"
					? "searching"
					: data.type === "hot-sample"
						? "sampling"
						: data.type === "active-discovery"
							? "expanding"
							: "evaluating",
			target,
			candidates: 0,
			queued: 0,
			updatedAt: new Date().toISOString(),
		});
		switch (data.type) {
			case "search-sweep":
				await this.handleSearchSweep(
					data.config,
					data.mode,
					report,
					data.offset ?? 0,
					checkpoint,
					data.completedQueries
				);
				break;
			case "fetch-video-details":
				await this.handleFetchVideoDetails(
					data.aid,
					data.source,
					data.sourceAid,
					data.position,
					data.origin,
					report
				);
				break;
			case "active-discovery":
				await this.handleActiveDiscovery(data.aid, report);
				break;
			case "hot-sample":
				await this.handleHotSample(data.limit, data.timeWindowDays, report);
				break;
		}
	}

	private async handleSearchSweep(
		config?: Partial<SearchRoverConfig>,
		mode?: "incremental" | "deep",
		report?: (progress: DiscoveryJobProgress) => Promise<void>,
		offset = 0,
		checkpoint?: (offset: number, key?: string) => Promise<void>,
		completedQueries: string[] = []
	): Promise<void> {
		const keywords =
			config?.keywords ?? this.filterService.getConfig().searchKeywords ?? DEFAULT_KEYWORDS;
		await this.searchRover.runSearchSweep(
			{ ...config, mode: mode ?? config?.mode, keywords },
			report,
			{
				offset,
				completedQueries,
				onPage: async (candidates, nextOffset, key) => {
					const existing = await this.trackingRepo.getTrackings(
						candidates.map((candidate) => candidate.aid)
					);
					const tracked = new Set(existing.map((row) => row.aid));
					let queued = 0;
					for (const candidate of candidates)
						if (!tracked.has(candidate.aid)) {
							await this.enqueueDetailFetch(
								candidate.aid,
								"search",
								candidate.origin
							);
							queued++;
						}
					await report?.({
						stage: "evaluating",
						target: null,
						candidates: candidates.length,
						queued,
						updatedAt: new Date().toISOString(),
					});
					await checkpoint?.(nextOffset, key);
				},
			}
		);
	}

	/**
	 * Hot-video sampling: pick the fastest-moving tracked videos whose
	 * recommendations have not been collected within the cooldown, then refresh
	 * their recommendation graph. This is what keeps discovery moving when the
	 * search sweep keeps returning the same results.
	 */
	private async handleHotSample(
		limit = DEFAULT_HOT_SAMPLE_LIMIT,
		timeWindowDays?: number,
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		if (!this.relatedDiscoveryEnabled) {
			appLogger.debug("Related discovery is paused; skipping hot sample", {
				component: "discovery-worker",
			});
			return;
		}

		await traceTask("discovery.worker.hotSample", async () => {
			const seeds = await this.discoveryRepo.listHotSampleCandidates({
				limit,
				cooldownMinutes: 60,
				now: toInstant(new Date()),
				timeWindowDays,
			});
			if (seeds.length === 0) {
				appLogger.debug("Hot sample found no eligible seeds", {
					component: "discovery-worker",
				});
				return;
			}

			let queued = 0;
			for (const aid of seeds) {
				await this.discoveryQueue.add(
					`active-${aid.toString()}`,
					{ type: "active-discovery", aid: aid.toString() },
					{
						deduplication: { id: `active-${aid.toString()}` },
						removeOnComplete: { age: 3600, count: 100 },
					}
				);
				queued++;
				await report?.({
					stage: "sampling",
					target: aid.toString(),
					candidates: seeds.length,
					queued,
					updatedAt: new Date().toISOString(),
				});
			}

			appLogger.info("Queued hot sample recommendation expansions", {
				component: "discovery-worker",
				seeds: seeds.length,
			});
		});
	}

	private async handleFetchVideoDetails(
		aidStr: string,
		source: "search" | "related" | "manual" | "hot_sample",
		_sourceAid?: string,
		_position?: number,
		origin?: DiscoveryOrigin,
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		await traceTask("discovery.worker.fetchVideoDetails", async () => {
			const aid = BigInt(aidStr);
			const evaluation = await this.evaluator.evaluate({
				aid,
				source,
				...(origin ? { origin } : {}),
				job: { id: `detail-${aidStr}` },
			});
			if (evaluation.status === "failed" && evaluation.reason === "fetch_failed")
				throw new AppError(
					evaluation.errorMessage ?? "Video detail fetch failed",
					"UPSTREAM_ERROR",
					502
				);
			await report?.({
				stage: "evaluating",
				target: aidStr,
				candidates:
					evaluation.status === "skipped" || evaluation.status === "failed" ? 0 : 1,
				queued: 0,
				updatedAt: new Date().toISOString(),
			});

			if (evaluation.status !== "accepted") return;
			if (!this.relatedDiscoveryEnabled) return;

			// Rejected/non-relevant videos are not traversed: following their
			// recommendations is how the crawl drifts out of the target domain.
			const related = evaluation.details.Related ?? [];
			if (related.length === 0) return;

			const queued = await this.enqueueRelatedCandidates(aid, related);
			await report?.({
				stage: "expanding",
				target: aidStr,
				candidates: related.length,
				queued,
				updatedAt: new Date().toISOString(),
			});
		});
	}

	private async handleActiveDiscovery(
		aidStr: string,
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		if (!this.relatedDiscoveryEnabled) {
			appLogger.debug("Related discovery is paused; skipping active discovery", {
				component: "discovery-worker",
				aid: aidStr,
			});
			return;
		}

		await traceTask("discovery.worker.activeDiscovery", async () => {
			const aid = /^BV/i.test(aidStr)
				? BigInt((await this.bilibiliClient.getVideoDetails(aidStr)).View.aid)
				: BigInt(aidStr);
			try {
				const related = await this.bilibiliClient.getRelatedVideos(aid);
				if (related.length === 0) return;
				const queued = await this.enqueueRelatedCandidates(aid, related);
				await report?.({
					stage: "expanding",
					target: aid.toString(),
					candidates: related.length,
					queued,
					updatedAt: new Date().toISOString(),
				});
			} catch (error) {
				appLogger.warn("Active discovery failed for aid", {
					component: "discovery-worker",
					aid: aidStr,
					error,
				});
				throw error;
			}
		});
	}

	private async enqueueRelatedCandidates(
		sourceAid: bigint,
		related: Parameters<RelationExtractor["extractAndPersist"]>[1]
	): Promise<number> {
		const now = toInstant(new Date());
		const extraction = await this.relationExtractor.extractAndPersist(sourceAid, related, now);

		const candidateAids = extraction.candidates.map((c) => c.aid);
		const existing = await this.trackingRepo.getTrackings(candidateAids);
		const trackedSet = new Set(existing.map((t) => t.aid));

		let queued = 0;
		for (const cand of extraction.candidates) {
			if (trackedSet.has(cand.aid)) continue;
			await this.enqueueDetailFetch(
				cand.aid,
				"related",
				cand.origin,
				sourceAid,
				cand.position
			);
			queued++;
		}
		return queued;
	}

	private async enqueueDetailFetch(
		aid: bigint,
		source: CandidateSource,
		origin?: DiscoveryOrigin,
		sourceAid?: bigint,
		position?: number
	): Promise<void> {
		const jobId = `detail-${aid.toString()}`;
		await this.discoveryQueue.add(
			jobId,
			{
				type: "fetch-video-details",
				aid: aid.toString(),
				source: source === "topic" ? "search" : source,
				...(origin ? { origin } : {}),
				...(sourceAid !== undefined ? { sourceAid: sourceAid.toString() } : {}),
				...(position !== undefined ? { position } : {}),
			},
			{ deduplication: { id: jobId }, removeOnComplete: { age: 3600, count: 100 } }
		);
	}
}

export function createDiscoveryWorker(
	mq: CrawlerMq,
	processor: DiscoveryPipelineProcessor,
	concurrency = 12,
	stats: StatsRecorder = createNoopStatsRecorder(),
	retryPolicy: () => RetryPolicy = () => ({
		maxAttempts: 5,
		baseDelayMs: 1000,
		maxDelayMs: 60000,
	})
): CrawlerWorker {
	return mq.createWorker<DiscoveryJobData>(
		DISCOVERY_QUEUE_NAME,
		async (job) => {
			if (job.data.type === "search-sweep" && job.data.asOf === undefined) {
				job.data = {
					...job.data,
					asOf: Date.now(),
					config: { ...job.data.config, asOf: Date.now() },
				};
				await job.updateData?.(job.data);
			}
			const startedAt = performance.now();
			if (job.enqueuedAt !== undefined)
				stats.recordQueueWait(
					Math.max(0, (job.startedAt ?? Date.now()) - job.enqueuedAt - (job.delayMs ?? 0))
				);
			stats.recordJobStarted("discovery");
			let latest: DiscoveryJobProgress = {
				stage: "starting",
				target: null,
				candidates: 0,
				queued: 0,
				updatedAt: new Date().toISOString(),
			};
			const report = async (progress: DiscoveryJobProgress) => {
				latest = progress;
				await job.updateProgress?.(progress);
			};
			try {
				let checkpoints = Promise.resolve();
				await processor.processJob(job.data, report, (offset, key) => {
					checkpoints = checkpoints.then(async () => {
						if (job.data.type !== "search-sweep") return;
						job.data = {
							...job.data,
							offset: Math.max(job.data.offset ?? 0, offset),
							completedQueries: key
								? [...new Set([...(job.data.completedQueries ?? []), key])]
								: job.data.completedQueries,
						};
						await job.updateData?.(job.data);
					});
					return checkpoints;
				});
				let completedTarget = latest.target;
				if (job.data.type === "search-sweep") {
					const sweepKeywords =
						job.data.config?.keywords ??
						processor.filterService.getConfig().searchKeywords ??
						DEFAULT_KEYWORDS;
					completedTarget = sweepKeywords.join(", ");
				}

				await report({
					...latest,
					stage: "completed",
					target: completedTarget,
					updatedAt: new Date().toISOString(),
				});
				stats.recordJobOutcome("discovery", "success", performance.now() - startedAt);
			} catch (error) {
				const outcome = outcomeOfError(error);
				if (error instanceof RetryLaterError)
					stats.recordDeferral({
						reason:
							error.reason === "local_capacity"
								? "local_budget"
								: error.reason === "network_recovery"
									? "egress_unavailable"
									: error.reason === "task_retry"
										? "task_retry"
										: "upstream_throttle",
						requestedMs: error.delayMs,
					});
				stats.recordJobOutcome("discovery", outcome, performance.now() - startedAt);
				await report({
					...latest,
					stage: error instanceof RetryLaterError ? "deferred" : "failed",
					updatedAt: new Date().toISOString(),
				});
				if (error instanceof RetryLaterError) throw error;
				const policy = retryPolicy();
				const failures = (job.data.failureAttempts ?? 0) + 1;
				await job.updateData?.({ ...job.data, failureAttempts: failures });
				if (failures >= policy.maxAttempts)
					throw new UnrecoverableError(
						error instanceof Error ? error.message : String(error)
					);
				const delayMs = Math.min(
					policy.maxDelayMs,
					policy.baseDelayMs * 2 ** (failures - 1)
				);
				stats.recordDeferral({ reason: "task_retry", requestedMs: delayMs });
				await report({ ...latest, stage: "deferred", updatedAt: new Date().toISOString() });
				throw new RetryLaterError(delayMs, "task_retry");
			}
		},
		{ concurrency }
	);
}
