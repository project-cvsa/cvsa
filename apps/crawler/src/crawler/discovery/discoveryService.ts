import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import type { BilibiliClient, BilibiliRelatedVideo } from "../bilibili";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { ITrackingRepository } from "../tracking/repository.interface";
import type { VideoClassifierClient } from "./classifier";
import { DiscoveryCandidateEvaluator } from "./evaluator";
import { DiscoveryFilterService } from "./filter";
import { RELATED_DISCOVERY_ENABLED } from "./flags";
import { RelationExtractor } from "./relationExtractor";
import type { IDiscoveryRepository } from "./repository.interface";
import { SearchRover } from "./searchRover";
import type { DiscoveredCandidate, SearchRoverConfig } from "./types";

export interface ProcessRecommendationsResult {
	sourceAid: bigint;
	relationsCount: number;
	newTracked: number;
}

export interface SearchSweepResult {
	totalDiscovered: number;
	newTracked: number;
}

/** Detail fetches per manual call, bounded so the control-plane request stays sane. */
const MAX_MANUAL_EVALUATIONS = 50;
const MANUAL_EVALUATION_CONCURRENCY = 4;

/**
 * Map with a fixed concurrency ceiling, preserving input order in the output.
 * Detail fetches are network-bound, so a handful in flight is much faster than a
 * sequential loop without turning a manual trigger into a burst.
 */
async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			const item = items[index];
			if (item === undefined) continue;
			results[index] = await fn(item);
		}
	});
	await Promise.all(workers);
	return results;
}

/**
 * Manual discovery entry points used by the control plane.
 *
 * Both paths used to insert every discovered aid straight into `video_tracking`,
 * which meant a manual sweep could poison tracking with unrelated videos. They
 * now run each candidate through {@link DiscoveryCandidateEvaluator} — the same
 * detail-fetch + filter + sample gate the queued worker uses.
 */
export class DiscoveryService {
	readonly relationExtractor: RelationExtractor;
	readonly searchRover: SearchRover;
	readonly evaluator: DiscoveryCandidateEvaluator;
	readonly filterService: DiscoveryFilterService;

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		readonly discoveryRepo: IDiscoveryRepository,
		private readonly trackingRepo: ITrackingRepository,
		filterService?: DiscoveryFilterService,
		classifier?: VideoClassifierClient,
		stats: StatsRecorder = createNoopStatsRecorder(),
		private readonly relatedDiscoveryEnabled = RELATED_DISCOVERY_ENABLED
	) {
		const effectiveFilter = filterService ?? new DiscoveryFilterService();
		this.filterService = effectiveFilter;
		this.relationExtractor = new RelationExtractor(discoveryRepo);
		this.searchRover = new SearchRover(bilibiliClient, discoveryRepo);
		this.evaluator = new DiscoveryCandidateEvaluator(
			bilibiliClient,
			discoveryRepo,
			trackingRepo,
			// A rules-only filter is still a filter: without a service instance the
			// evaluator must not silently accept everything.
			effectiveFilter,
			classifier,
			stats
		);
	}

	async processVideoRecommendations(
		sourceAid: bigint,
		relatedVideos?: BilibiliRelatedVideo[]
	): Promise<ProcessRecommendationsResult> {
		if (!this.relatedDiscoveryEnabled) {
			appLogger.debug("Related discovery is paused; skipping recommendation processing", {
				component: "discovery-service",
				sourceAid: sourceAid.toString(),
			});
			return { sourceAid, relationsCount: 0, newTracked: 0 };
		}

		return traceTask("discovery.processVideoRecommendations", async () => {
			let items = relatedVideos;
			if (!items) {
				try {
					items = await this.bilibiliClient.getRelatedVideos(sourceAid);
				} catch (error) {
					appLogger.warn("Failed to fetch related videos for aid", {
						component: "discovery-service",
						sourceAid: sourceAid.toString(),
						error,
					});
					return { sourceAid, relationsCount: 0, newTracked: 0 };
				}
			}

			const extraction = await this.relationExtractor.extractAndPersist(sourceAid, items);
			if (extraction.candidates.length === 0) {
				return { sourceAid, relationsCount: 0, newTracked: 0 };
			}

			const newTracked = await this.evaluateAll(extraction.candidates, "related");

			appLogger.info("Processed video recommendations", {
				component: "discovery-service",
				sourceAid: sourceAid.toString(),
				relationsCount: extraction.relationsCount,
				newTracked,
			});

			return {
				sourceAid,
				relationsCount: extraction.relationsCount,
				newTracked,
			};
		});
	}

	async runSearchSweep(config?: Partial<SearchRoverConfig>): Promise<SearchSweepResult> {
		return traceTask("discovery.runSearchSweep", async () => {
			const effectiveKeywords =
				config?.keywords ?? this.filterService.getConfig().searchKeywords;
			let totalDiscovered = 0;
			let newTracked = 0;

			await this.searchRover.runSearchSweep(
				{
					...config,
					keywords: effectiveKeywords,
				},
				undefined,
				{
					offset: 0,
					onPage: async (pageCandidates) => {
						totalDiscovered += pageCandidates.length;
						const tracked = await this.evaluateAll(pageCandidates, "search");
						newTracked += tracked;
					},
				}
			);

			appLogger.info("Search sweep discovery finished", {
				component: "discovery-service",
				totalDiscovered,
				newTracked,
			});

			return { totalDiscovered, newTracked };
		});
	}

	private async evaluateAll(
		candidates: readonly DiscoveredCandidate[],
		source: "search" | "related"
	): Promise<number> {
		const candidateAids = candidates.map((c) => c.aid);
		const existing = await this.trackingRepo.getTrackings(candidateAids);
		const trackedSet = new Set(existing.map((t) => t.aid));

		const pending = candidates
			.filter((candidate) => !trackedSet.has(candidate.aid))
			.slice(0, MAX_MANUAL_EVALUATIONS);
		if (pending.length === 0) return 0;

		const untrackedCount = new Set(
			candidates.filter((candidate) => !trackedSet.has(candidate.aid)).map((c) => c.aid)
		).size;
		if (pending.length < untrackedCount) {
			appLogger.warn("Manual discovery evaluation truncated", {
				component: "discovery-service",
				requested: untrackedCount,
				evaluated: pending.length,
				limit: MAX_MANUAL_EVALUATIONS,
			});
		}

		const evaluations = await mapWithConcurrency(
			pending,
			MANUAL_EVALUATION_CONCURRENCY,
			(candidate) =>
				this.evaluator.evaluate({
					aid: candidate.aid,
					source,
					origin: candidate.origin,
				})
		);

		return evaluations.filter((evaluation) => evaluation.status === "accepted").length;
	}
}
