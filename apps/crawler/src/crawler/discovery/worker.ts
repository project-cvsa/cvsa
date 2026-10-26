import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
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

	async processJob(data: DiscoveryJobData): Promise<void> {
		switch (data.type) {
			case "search-sweep":
				await this.handleSearchSweep(data.config);
				break;
			case "fetch-video-details":
				await this.handleFetchVideoDetails(
					data.aid,
					data.source,
					data.sourceAid,
					data.position
				);
				break;
			case "active-discovery":
				await this.handleActiveDiscovery(data.aid);
				break;
			case "hot-sample":
				await this.handleHotSample(data.limit);
				break;
		}
	}

	private async handleSearchSweep(config?: Partial<SearchRoverConfig>): Promise<void> {
		await traceTask("discovery.worker.searchSweep", async () => {
			appLogger.info("Executing scheduled search sweep", {
				component: "discovery-worker",
			});

			const candidates = await this.searchRover.runSearchSweep(config);
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
	private async handleHotSample(limit = DEFAULT_HOT_SAMPLE_LIMIT): Promise<void> {
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

			for (const aid of seeds) {
				await this.discoveryQueue.add(
					`active-${aid.toString()}`,
					{ type: "active-discovery", aid: aid.toString() },
					{ jobId: `active-${aid.toString()}`, removeOnComplete: true }
				);
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
		_position?: number
	): Promise<void> {
		await traceTask("discovery.worker.fetchVideoDetails", async () => {
			const aid = BigInt(aidStr);
			const evaluation = await this.evaluator.evaluate({ aid, source });

			if (evaluation.status !== "accepted") return;

			// Rejected/non-relevant videos are not traversed: following their
			// recommendations is how the crawl drifts out of the target domain.
			const related = evaluation.details.Related ?? [];
			if (related.length === 0) return;

			await this.enqueueRelatedCandidates(aid, related);
		});
	}

	private async handleActiveDiscovery(aidStr: string): Promise<void> {
		await traceTask("discovery.worker.activeDiscovery", async () => {
			const aid = BigInt(aidStr);
			try {
				const related = await this.bilibiliClient.getRelatedVideos(aid);
				if (related.length === 0) return;
				await this.enqueueRelatedCandidates(aid, related);
			} catch (error) {
				appLogger.warn("Active discovery failed for aid", {
					component: "discovery-worker",
					aid: aidStr,
					error,
				});
			}
		});
	}

	private async enqueueRelatedCandidates(
		sourceAid: bigint,
		related: Parameters<RelationExtractor["extractAndPersist"]>[1]
	): Promise<void> {
		const now = toInstant(new Date());
		const extraction = await this.relationExtractor.extractAndPersist(sourceAid, related, now);

		const candidateAids = extraction.candidates.map((c) => c.aid);
		const existing = await this.trackingRepo.getTrackings(candidateAids);
		const trackedSet = new Set(existing.map((t) => t.aid));

		for (const cand of extraction.candidates) {
			if (trackedSet.has(cand.aid)) continue;
			await this.enqueueDetailFetch(cand.aid, "related", sourceAid, cand.position);
		}
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
			{ jobId, removeOnComplete: true }
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
			try {
				await processor.processJob(job.data);
			} finally {
				stats.recordJobCompleted();
				stats.recordTask(performance.now() - startedAt);
			}
		},
		{ concurrency }
	);
}
