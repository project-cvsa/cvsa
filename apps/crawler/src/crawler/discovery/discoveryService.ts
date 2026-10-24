import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient, BilibiliRelatedVideo } from "../bilibili";
import type { ITrackingRepository } from "../tracking/repository.interface";
import { RelationExtractor } from "./relationExtractor";
import type { IDiscoveryRepository } from "./repository.interface";
import { SearchRover } from "./searchRover";
import type { SearchRoverConfig } from "./types";

export interface ProcessRecommendationsResult {
	sourceAid: bigint;
	relationsCount: number;
	newTracked: number;
}

export interface SearchSweepResult {
	totalDiscovered: number;
	newTracked: number;
}

export class DiscoveryService {
	readonly relationExtractor: RelationExtractor;
	readonly searchRover: SearchRover;

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		readonly discoveryRepo: IDiscoveryRepository,
		private readonly trackingRepo: ITrackingRepository
	) {
		this.relationExtractor = new RelationExtractor(discoveryRepo);
		this.searchRover = new SearchRover(bilibiliClient, discoveryRepo);
	}

	async processVideoRecommendations(
		sourceAid: bigint,
		relatedVideos?: BilibiliRelatedVideo[]
	): Promise<ProcessRecommendationsResult> {
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

			const candidateAids = extraction.candidates.map((c) => c.aid);
			const existingTrackings = await this.trackingRepo.getTrackings(candidateAids);
			const trackedSet = new Set(existingTrackings.map((t) => t.aid));

			const newCandidates = extraction.candidates.filter((c) => !trackedSet.has(c.aid));
			const now = toInstant(new Date());

			for (const cand of newCandidates) {
				await this.trackingRepo.upsertTracking({
					aid: cand.aid,
					state: "regular",
					nextSnapshotAt: now,
					publishedAt: cand.pubdate ?? null,
					priority: 2,
				});
			}

			appLogger.info("Processed video recommendations", {
				component: "discovery-service",
				sourceAid: sourceAid.toString(),
				relationsCount: extraction.relationsCount,
				newTracked: newCandidates.length,
			});

			return {
				sourceAid,
				relationsCount: extraction.relationsCount,
				newTracked: newCandidates.length,
			};
		});
	}

	async runSearchSweep(config?: Partial<SearchRoverConfig>): Promise<SearchSweepResult> {
		return traceTask("discovery.runSearchSweep", async () => {
			const candidates = await this.searchRover.runSearchSweep(config);
			if (candidates.length === 0) {
				return { totalDiscovered: 0, newTracked: 0 };
			}

			const candidateAids = candidates.map((c) => c.aid);
			const existingTrackings = await this.trackingRepo.getTrackings(candidateAids);
			const trackedSet = new Set(existingTrackings.map((t) => t.aid));

			const newCandidates = candidates.filter((c) => !trackedSet.has(c.aid));
			const now = toInstant(new Date());

			for (const cand of newCandidates) {
				await this.trackingRepo.upsertTracking({
					aid: cand.aid,
					state: "regular",
					nextSnapshotAt: now,
					publishedAt: cand.pubdate ?? null,
					priority: 2,
				});
			}

			appLogger.info("Search sweep discovery finished", {
				component: "discovery-service",
				totalDiscovered: candidates.length,
				newTracked: newCandidates.length,
			});

			return {
				totalDiscovered: candidates.length,
				newTracked: newCandidates.length,
			};
		});
	}
}
