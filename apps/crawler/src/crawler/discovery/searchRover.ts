import type { DiscoveryJobProgress } from "@cvsa/contracts";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient, SearchVideo } from "../bilibili";
import type { IDiscoveryRepository } from "./repository.interface";
import { fromSearchTagString } from "./tags";
import type { DiscoveredCandidate, SearchRoverConfig, UpsertMetadataInput } from "./types";

const DEFAULT_KEYWORDS = [
	"洛天依原创",
	"言和原创",
	"乐正绫原创",
	"星尘原创",
	"初音未来原创",
	"Synthesizer V 原创",
	"VOCALOID中文曲",
	"VOCALOID",
	"CeVIO",
	"ACE Studio",
];

const DEFAULT_ORDERS: Array<"totalrank" | "click" | "pubdate" | "dm" | "stow"> = [
	"pubdate",
	"totalrank",
	"click",
];

function stripHighlightTags(text: string): string {
	return text.replace(/<[^>]*>/g, "");
}

function parseDurationString(duration: string): number {
	const parts = duration.split(":").map(Number);
	if (parts.some((n) => Number.isNaN(n))) return 0;
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	return 0;
}

export class SearchRover {
	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly discoveryRepo: IDiscoveryRepository
	) {}

	async runSearchQuery(
		keyword: string,
		options: {
			order?: "totalrank" | "click" | "pubdate" | "dm" | "stow";
			page?: number;
			pageSize?: number;
			from?: number | Date;
			to?: number | Date;
			categoryId?: number;
		} = {}
	): Promise<DiscoveredCandidate[]> {
		return traceTask("discovery.searchRover.query", async () => {
			const res = await this.bilibiliClient.searchVideos(keyword, options);
			if (res.code !== 0 || !res.data) {
				appLogger.warn("Search rover query failed", {
					component: "search-rover",
					keyword,
					code: res.code,
					message: res.message,
				});
				return [];
			}

			const videos: SearchVideo[] = res.data.result ?? [];
			if (videos.length === 0) return [];

			const now = toInstant(new Date());
			const candidates: DiscoveredCandidate[] = [];
			const metadatas: UpsertMetadataInput[] = [];

			for (const video of videos) {
				if (!video?.aid) continue;
				const aid = BigInt(video.aid);
				const cleanTitle = stripHighlightTags(video.title ?? "");
				const pubdate = video.pubdate ? toInstant(new Date(video.pubdate * 1000)) : null;

				const metadata: UpsertMetadataInput = {
					aid,
					bvid: video.bvid,
					title: cleanTitle,
					description: video.description ? stripHighlightTags(video.description) : null,
					pic: video.pic
						? video.pic.startsWith("//")
							? `https:${video.pic}`
							: video.pic
						: null,
					pubdate,
					duration:
						typeof video.duration === "string"
							? parseDurationString(video.duration)
							: 0,
					mid: video.mid ? BigInt(video.mid) : null,
					ownerName: video.author ?? null,
					ownerFace: video.upic
						? video.upic.startsWith("//")
							? `https:${video.upic}`
							: video.upic
						: null,
					tid: video.typeid ? Number(video.typeid) : null,
					tname: video.typename ?? null,
					tags: fromSearchTagString(video.tag),
					discoverySource: "search",
					capturedAt: now,
				};

				metadatas.push(metadata);
				candidates.push({
					aid,
					bvid: video.bvid,
					title: cleanTitle,
					source: "search",
					pubdate,
					rawVideo: video,
				});
			}

			await this.discoveryRepo.bulkUpsertMetadata(metadatas);

			appLogger.info("Search rover completed query", {
				component: "search-rover",
				keyword,
				order: options.order ?? "totalrank",
				page: options.page ?? 1,
				discovered: candidates.length,
			});

			return candidates;
		});
	}

	async runSearchSweep(
		config: Partial<SearchRoverConfig> = {},
		onProgress?: (progress: DiscoveryJobProgress) => Promise<void>
	): Promise<DiscoveredCandidate[]> {
		return traceTask("discovery.searchRover.sweep", async () => {
			const keywords = config.keywords ?? DEFAULT_KEYWORDS;
			const orders = config.orders ?? DEFAULT_ORDERS;
			const pagesPerQuery = config.pagesPerQuery ?? 1;

			const allCandidates: DiscoveredCandidate[] = [];
			const seenAids = new Set<bigint>();

			for (const keyword of keywords) {
				for (const order of orders) {
					for (let page = 1; page <= pagesPerQuery; page++) {
						try {
							await onProgress?.({
								stage: "searching",
								target: keyword,
								order,
								page,
								candidates: allCandidates.length,
								queued: 0,
								updatedAt: new Date().toISOString(),
							});
							const results = await this.runSearchQuery(keyword, {
								order,
								page,
								categoryId: config.categoryId,
							});

							for (const cand of results) {
								if (!seenAids.has(cand.aid)) {
									seenAids.add(cand.aid);
									allCandidates.push(cand);
								}
							}
						} catch (error) {
							appLogger.error("Search rover query encountered error", {
								component: "search-rover",
								keyword,
								order,
								page,
								error,
							});
						}
					}
				}
			}

			appLogger.info("Search rover sweep completed", {
				component: "search-rover",
				keywordsCount: keywords.length,
				uniqueDiscovered: allCandidates.length,
			});

			await onProgress?.({
				stage: "searching",
				target: null,
				candidates: allCandidates.length,
				queued: 0,
				updatedAt: new Date().toISOString(),
			});
			return allCandidates;
		});
	}
}
