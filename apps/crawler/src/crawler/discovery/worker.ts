import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient, VideoDetailsData } from "../bilibili";
import type { CrawlerMq, CrawlerQueue, CrawlerWorker } from "../shared/types";
import type { ITrackingRepository } from "../tracking/repository.interface";
import { DiscoveryFilterService } from "./filter";
import { RelationExtractor } from "./relationExtractor";
import type { IDiscoveryRepository } from "./repository.interface";
import { SearchRover } from "./searchRover";
import type { SearchRoverConfig, UpsertMetadataInput } from "./types";

export type DiscoveryJobData =
	| { type: "search-sweep"; config?: Partial<SearchRoverConfig> }
	| {
			type: "fetch-video-details";
			aid: string;
			source: "search" | "related" | "manual";
			sourceAid?: string;
			position?: number;
	  }
	| { type: "active-discovery"; aid: string };

export const DISCOVERY_QUEUE_NAME = "crawler-discovery";

export class DiscoveryPipelineProcessor {
	readonly filterService: DiscoveryFilterService;
	readonly relationExtractor: RelationExtractor;
	readonly searchRover: SearchRover;

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly discoveryRepo: IDiscoveryRepository,
		private readonly trackingRepo: ITrackingRepository,
		private readonly discoveryQueue: CrawlerQueue<DiscoveryJobData>,
		filterService?: DiscoveryFilterService
	) {
		this.filterService = filterService ?? new DiscoveryFilterService();
		this.relationExtractor = new RelationExtractor(discoveryRepo);
		this.searchRover = new SearchRover(bilibiliClient, discoveryRepo);
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
					await this.discoveryQueue.add(
						`detail-${cand.aid.toString()}`,
						{
							type: "fetch-video-details",
							aid: cand.aid.toString(),
							source: "search",
						},
						{
							jobId: `detail-${cand.aid.toString()}`,
							removeOnComplete: true,
						}
					);
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

	private async handleFetchVideoDetails(
		aidStr: string,
		source: "search" | "related" | "manual",
		_sourceAid?: string,
		_position?: number
	): Promise<void> {
		await traceTask("discovery.worker.fetchVideoDetails", async () => {
			const aid = BigInt(aidStr);

			// Check if already tracked
			const existing = await this.trackingRepo.getTracking(aid);
			if (existing) {
				appLogger.debug("Video already tracked; skipping detail fetch", {
					component: "discovery-worker",
					aid: aidStr,
				});
				return;
			}

			// 1. Fetch full details from Bilibili
			let details: VideoDetailsData;
			try {
				details = await this.bilibiliClient.getVideoDetails(aid);
			} catch (error) {
				appLogger.warn("Failed to fetch video details for candidate", {
					component: "discovery-worker",
					aid: aidStr,
					error,
				});
				return;
			}

			const view = details.View;
			const card = details.Card;
			const tags = details.Tags ?? [];
			const related = details.Related ?? [];

			const tagNames = tags.map((t) => t.tag_name);

			// 2. Evaluate candidate with Whitelist + Model filter
			const decision = this.filterService.evaluateVideo({
				title: view.title,
				tags: tagNames,
				description: view.desc,
				duration: view.duration,
			});

			const now = toInstant(new Date());
			const pubdate = view.pubdate ? toInstant(new Date(view.pubdate * 1000)) : null;

			// Prepare full metadata payload
			const metadataInput: UpsertMetadataInput = {
				aid,
				bvid: view.bvid,
				title: view.title,
				description: view.desc,
				pic: view.pic,
				pubdate,
				duration: view.duration,
				mid: view.owner?.mid ? BigInt(view.owner.mid) : null,
				ownerName: view.owner?.name ?? card?.card?.name ?? null,
				ownerFace: view.owner?.face ?? card?.card?.face ?? null,
				tid: view.tid,
				tname: view.tname,
				copyright: view.copyright,
				tags: tagNames,
				rawPayload: {
					...details,
					filterDecision: decision,
				},
				capturedAt: now,
			};

			if (decision.action === "accept") {
				// Accept: Persist rich metadata & promote to active tracking
				await this.discoveryRepo.upsertMetadata(metadataInput);
				await this.trackingRepo.upsertTracking({
					aid,
					state: "new",
					nextSnapshotAt: now,
					publishedAt: pubdate,
					priority: 2,
				});

				appLogger.info("Discovery candidate accepted and added to tracking", {
					component: "discovery-worker",
					aid: aidStr,
					title: view.title,
					reason: decision.reason,
					source,
				});
			} else {
				// Reject: check if sampled for data archive / retraining
				if (decision.sampled) {
					await this.discoveryRepo.upsertMetadata({
						...metadataInput,
						tags: [...tagNames, "__sampled_rejection__"],
					});
					appLogger.info(
						"Discovery candidate rejected but sampled for training dataset",
						{
							component: "discovery-worker",
							aid: aidStr,
							title: view.title,
							reason: decision.reason,
						}
					);
				} else {
					appLogger.debug("Discovery candidate rejected and discarded", {
						component: "discovery-worker",
						aid: aidStr,
						title: view.title,
						reason: decision.reason,
					});
				}
				// Do not traverse recommendations of rejected non-relevant videos
				return;
			}

			// 3. Extract recommendations & graph topology
			if (related.length > 0) {
				const extraction = await this.relationExtractor.extractAndPersist(
					aid,
					related,
					now
				);

				// Enqueue child candidate detail fetches for untracked related videos
				for (const cand of extraction.candidates) {
					const candExisting = await this.trackingRepo.getTracking(cand.aid);
					if (!candExisting) {
						await this.discoveryQueue.add(
							`detail-${cand.aid.toString()}`,
							{
								type: "fetch-video-details",
								aid: cand.aid.toString(),
								source: "related",
								sourceAid: aidStr,
								position: cand.position,
							},
							{
								jobId: `detail-${cand.aid.toString()}`,
								removeOnComplete: true,
							}
						);
					}
				}
			}
		});
	}

	private async handleActiveDiscovery(aidStr: string): Promise<void> {
		await traceTask("discovery.worker.activeDiscovery", async () => {
			const aid = BigInt(aidStr);
			try {
				const related = await this.bilibiliClient.getRelatedVideos(aid);
				if (related.length === 0) return;

				const extraction = await this.relationExtractor.extractAndPersist(aid, related);
				for (const cand of extraction.candidates) {
					const candExisting = await this.trackingRepo.getTracking(cand.aid);
					if (!candExisting) {
						await this.discoveryQueue.add(
							`detail-${cand.aid.toString()}`,
							{
								type: "fetch-video-details",
								aid: cand.aid.toString(),
								source: "related",
								sourceAid: aidStr,
								position: cand.position,
							},
							{
								jobId: `detail-${cand.aid.toString()}`,
								removeOnComplete: true,
							}
						);
					}
				}
			} catch (error) {
				appLogger.warn("Active discovery failed for aid", {
					component: "discovery-worker",
					aid: aidStr,
					error,
				});
			}
		});
	}
}

export function createDiscoveryWorker(
	mq: CrawlerMq,
	processor: DiscoveryPipelineProcessor,
	concurrency = 3
): CrawlerWorker {
	return mq.createWorker<DiscoveryJobData>(
		DISCOVERY_QUEUE_NAME,
		async (job) => {
			await processor.processJob(job.data);
		},
		{ concurrency }
	);
}
