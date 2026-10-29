import { AppError, type DiscoveryJobProgress } from "@cvsa/contracts";
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
import { RelationExtractor } from "./relationExtractor";
import type { IDiscoveryRepository } from "./repository.interface";
import { SearchRover } from "./searchRover";
import type { CandidateSource, SearchRoverConfig } from "./types";

export type DiscoveryJobData =
	| { type: "search-sweep"; config?: Partial<SearchRoverConfig> }
	| {
			type: "fetch-video-details";
			aid: string;
			source: "search" | "related" | "manual" | "hot_sample";
			sourceAid?: string;
			position?: number;
	  }
	| { type: "active-discovery"; aid: string }
	| { type: "hot-sample"; limit?: number };

export const DISCOVERY_QUEUE_NAME = "crawler-discovery";

/**
 * Retry policy for every discovery job.
 *
 * When the network pool is temporarily exhausted (all adapters circuit-open
 * after 429 throttling) the scheduler answers `NO_AVAILABLE_ADAPTER` and the
 * job throws. The shared defaults (3 attempts, 1s exponential) burn out within
 * seconds, so a short outage permanently failed the whole detail backlog. The
 * throttle cooldown keeps an adapter open for at least 60s, therefore the first
 * retry waits 60s and the exponential ladder (60/120/240/480s) keeps deferring
 * long enough for the pool to recover before the job is finally failed.
 *
 * Tracking (`snapshot-batch`) queue defaults are intentionally untouched.
 */
export const DISCOVERY_QUEUE_JOB_OPTIONS: JobsOptions = {
	attempts: 5,
	backoff: { type: "exponential", delay: 60_000 },
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
		stats: StatsRecorder = createNoopStatsRecorder()
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
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		const target =
			"aid" in data
				? data.aid
				: data.type === "search-sweep"
					? (data.config?.keywords?.join(", ") ?? null)
					: null;
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
				await this.handleSearchSweep(data.config, report);
				break;
			case "fetch-video-details":
				await this.handleFetchVideoDetails(
					data.aid,
					data.source,
					data.sourceAid,
					data.position,
					report
				);
				break;
			case "active-discovery":
				await this.handleActiveDiscovery(data.aid, report);
				break;
			case "hot-sample":
				await this.handleHotSample(data.limit, report);
				break;
		}
	}

	private async handleSearchSweep(
		config?: Partial<SearchRoverConfig>,
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		await traceTask("discovery.worker.searchSweep", async () => {
			appLogger.info("Executing scheduled search sweep", {
				component: "discovery-worker",
			});

			const effectiveKeywords =
				config?.keywords ?? this.filterService.getConfig().searchKeywords;
			const candidates = await this.searchRover.runSearchSweep(
				{
					...config,
					keywords: effectiveKeywords,
				},
				report
			);
			if (candidates.length === 0) return;

			// Filter out already tracked aids before queuing detail fetch
			const candidateAids = candidates.map((c) => c.aid);
			const existing = await this.trackingRepo.getTrackings(candidateAids);
			const trackedSet = new Set(existing.map((t) => t.aid));

			let queued = 0;
			for (const cand of candidates) {
				if (!trackedSet.has(cand.aid)) {
					await this.enqueueDetailFetch(cand.aid, "search");
					queued++;
					await report?.({
						stage: "evaluating",
						target: cand.aid.toString(),
						candidates: candidates.length,
						queued,
						updatedAt: new Date().toISOString(),
					});
				}
			}

			appLogger.info("Search sweep finished, queued candidate detail fetches", {
				component: "discovery-worker",
				totalFound: candidates.length,
				newCandidatesQueued: queued,
			});
		});
	}

	/**
	 * Hot-video sampling: pick the fastest-moving tracked videos whose
	 * recommendations have not been collected within the cooldown, then refresh
	 * their recommendation graph. This is what keeps discovery moving when the
	 * search sweep keeps returning the same results.
	 */
	private async handleHotSample(
		limit = DEFAULT_HOT_SAMPLE_LIMIT,
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		await traceTask("discovery.worker.hotSample", async () => {
			const seeds = await this.discoveryRepo.listHotSampleCandidates({
				limit,
				cooldownMinutes: 60,
				now: toInstant(new Date()),
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
		report?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<void> {
		await traceTask("discovery.worker.fetchVideoDetails", async () => {
			const aid = BigInt(aidStr);
			const evaluation = await this.evaluator.evaluate({ aid, source });
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
			await this.enqueueDetailFetch(cand.aid, "related", sourceAid, cand.position);
			queued++;
		}
		return queued;
	}

	private async enqueueDetailFetch(
		aid: bigint,
		source: CandidateSource,
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
	concurrency = 3,
	stats: StatsRecorder = createNoopStatsRecorder()
): CrawlerWorker {
	return mq.createWorker<DiscoveryJobData>(
		DISCOVERY_QUEUE_NAME,
		async (job) => {
			const startedAt = performance.now();
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
				await processor.processJob(job.data, report);
				await report({
					...latest,
					stage: "completed",
					updatedAt: new Date().toISOString(),
				});
				stats.recordJobCompleted();
			} catch (error) {
				await report({ ...latest, stage: "failed", updatedAt: new Date().toISOString() });
				throw error;
			} finally {
				stats.recordTask(performance.now() - startedAt);
			}
		},
		{ concurrency }
	);
}
