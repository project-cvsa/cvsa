import { RetryLaterError } from "../shared/retryLater";
import type { DiscoveryJobProgress } from "@cvsa/contracts";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient, SearchVideo } from "../bilibili";
import type { IDiscoveryRepository } from "./repository.interface";
import type { DiscoveredCandidate, SearchRoverConfig } from "./types";

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

export class SearchRover {
	constructor(
		private readonly bilibiliClient: BilibiliClient,
		readonly _discoveryRepo?: IDiscoveryRepository
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

			const capturedAt = new Date().toISOString();
			const candidates: DiscoveredCandidate[] = [];

			for (const [index, video] of videos.entries()) {
				if (!video?.aid) continue;
				const aid = BigInt(video.aid);
				const cleanTitle = stripHighlightTags(video.title ?? "");
				const pubdate = video.pubdate ? toInstant(new Date(video.pubdate * 1000)) : null;
				const origin = {
					channel: "search" as const,
					capturedAt,
					search: {
						keyword,
						order: options.order ?? "totalrank",
						page: options.page ?? 1,
						position: index + 1,
						categoryId: options.categoryId ?? null,
					},
				};

				candidates.push({
					aid,
					bvid: video.bvid,
					title: cleanTitle,
					source: "search",
					origin,
					pubdate,
					rawVideo: video,
				});
			}

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
		onProgress?: (progress: DiscoveryJobProgress) => Promise<void>,
		continuation?: {
			offset: number;
			onPage: (candidates: DiscoveredCandidate[], offset: number) => Promise<void>;
		}
	): Promise<DiscoveredCandidate[]> {
		return traceTask("discovery.searchRover.sweep", async () => {
			const keywords = config.keywords ?? DEFAULT_KEYWORDS;
			const orders = config.orders ?? DEFAULT_ORDERS;
			const pagesPerQuery = config.pagesPerQuery ?? 1;

			const allCandidates: DiscoveredCandidate[] = [];
			const seenAids = new Set<bigint>();
			let offset = 0;

			for (const keyword of keywords) {
				for (const order of orders) {
					for (let page = 1; page <= pagesPerQuery; page++) {
						if (offset++ < (continuation?.offset ?? 0)) continue;
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

							await continuation?.onPage(results, offset);
							for (const cand of results) {
								if (!seenAids.has(cand.aid)) {
									seenAids.add(cand.aid);
									allCandidates.push(cand);
								}
							}
						} catch (error) {
							if (error instanceof RetryLaterError || continuation) throw error;
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

			if (!continuation)
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
