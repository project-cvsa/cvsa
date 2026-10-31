import type { DiscoveryJobProgress } from "@cvsa/contracts";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import { type BilibiliClient, type SearchVideo, toUnixTimestamp } from "../bilibili";
import { RetryLaterError } from "../shared/retryLater";
import type { IDiscoveryRepository } from "./repository.interface";
import type { DiscoveredCandidate, SearchRoverConfig } from "./types";

export const WINDOW_SIZE_SECONDS = 600; // 10 minutes

export const DEFAULT_KEYWORDS = [
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

export const DEFAULT_INCREMENTAL_ORDERS: Array<"totalrank" | "click" | "pubdate" | "dm" | "stow"> =
	["pubdate"];

export const DEFAULT_DEEP_ORDERS: Array<"totalrank" | "click" | "pubdate" | "dm" | "stow"> = [
	"click",
	"totalrank",
];

export const DEFAULT_DEEP_TIME_SLICES_DAYS = [1, 3, 7, 14, 30] as const;

function stripHighlightTags(text: string): string {
	return text.replace(/<[^>]*>/g, "");
}

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T) => Promise<void>
): Promise<void> {
	if (items.length === 0) return;
	let cursor = 0;
	const workerCount = Math.min(Math.max(1, concurrency), items.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			const item = items[index];
			if (item === undefined) continue;
			await worker(item);
		}
	});
	await Promise.all(workers);
}

export class SearchRover {
	constructor(
		private readonly bilibiliClient: BilibiliClient,
		readonly discoveryRepo?: IDiscoveryRepository
	) {}

	async runSearchQueryDetailed(
		keyword: string,
		options: {
			order?: "totalrank" | "click" | "pubdate" | "dm" | "stow";
			page?: number;
			pageSize?: number;
			from?: number | Date;
			to?: number | Date;
			categoryId?: number;
		} = {}
	): Promise<{
		candidates: DiscoveredCandidate[];
		numPages: number;
		numResults: number;
		failed?: boolean;
	}> {
		return traceTask("discovery.searchRover.query", async () => {
			const res = await this.bilibiliClient.searchVideos(keyword, options);
			if (res.code !== 0 || !res.data) {
				appLogger.warn("Search rover query failed", {
					component: "search-rover",
					keyword,
					code: res.code,
					message: res.message,
				});
				return { candidates: [], numPages: 0, numResults: 0, failed: true };
			}

			const videos: SearchVideo[] = res.data.result ?? [];
			const numPages =
				typeof res.data.numPages === "number" && res.data.numPages > 0
					? res.data.numPages
					: Number.POSITIVE_INFINITY;
			const numResults =
				typeof res.data.numResults === "number" ? res.data.numResults : videos.length;
			if (videos.length === 0) return { candidates: [], numPages: 0, numResults };

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
				numPages,
			});

			return { candidates, numPages, numResults };
		});
	}

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
		const res = await this.runSearchQueryDetailed(keyword, options);
		return res.candidates;
	}

	private async markSlotsExplored(
		keyword: string,
		fromSec: number,
		toSec: number
	): Promise<void> {
		if (!this.discoveryRepo) return;
		const fromSlot = Math.ceil(fromSec / WINDOW_SIZE_SECONDS) * WINDOW_SIZE_SECONDS;
		const toSlot =
			Math.floor(toSec / WINDOW_SIZE_SECONDS) * WINDOW_SIZE_SECONDS - WINDOW_SIZE_SECONDS;
		if (fromSlot > toSlot) return;
		const windows: { keyword: string; windowStart: number }[] = [];
		for (let s = fromSlot; s <= toSlot; s += WINDOW_SIZE_SECONDS) {
			windows.push({ keyword, windowStart: s });
		}
		if (windows.length > 0) {
			await this.discoveryRepo.markSearchWindowsExplored(windows);
		}
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
			const concurrency = Math.max(1, Math.min(config.concurrency ?? 4, 10));
			const allCandidates: DiscoveredCandidate[] = [];
			const seenAids = new Set<bigint>();

			const addCandidates = (candidates: DiscoveredCandidate[]) => {
				for (const cand of candidates) {
					if (!seenAids.has(cand.aid)) {
						seenAids.add(cand.aid);
						allCandidates.push(cand);
					}
				}
			};

			const isDeepMode = config.mode === "deep";
			const isExplicitOrders = config.orders !== undefined && config.orders.length > 0;

			if (isDeepMode) {
				// Deep Mode: Multi-window slices with high engagement orders
				const orders = config.orders ?? DEFAULT_DEEP_ORDERS;
				const timeSlices = DEFAULT_DEEP_TIME_SLICES_DAYS;
				const maxPages = config.pagesPerQuery ?? 10;
				const nowSec = Math.floor(Date.now() / 1000);
				let stepIndex = 0;

				interface DeepTask {
					keyword: string;
					order: "click" | "totalrank" | "pubdate" | "dm" | "stow";
					days: number;
				}

				const tasks: DeepTask[] = [];
				for (const keyword of keywords) {
					for (const order of orders) {
						for (const days of timeSlices) {
							tasks.push({ keyword, order, days });
						}
					}
				}

				await runWithConcurrency(tasks, concurrency, async (task) => {
					const fromSec = nowSec - task.days * 86400;
					for (let page = 1; page <= maxPages; page++) {
						const currentStep = ++stepIndex;
						if (currentStep <= (continuation?.offset ?? 0)) continue;

						try {
							await onProgress?.({
								stage: "searching",
								target: `${task.keyword} (${task.days}d)`,
								order: task.order,
								page,
								candidates: allCandidates.length,
								queued: 0,
								updatedAt: new Date().toISOString(),
							});

							const queryRes = await this.runSearchQueryDetailed(task.keyword, {
								order: task.order,
								page,
								from: fromSec,
								to: nowSec,
								categoryId: config.categoryId,
							});

							if (queryRes.candidates.length === 0) break;

							await continuation?.onPage(queryRes.candidates, currentStep);
							addCandidates(queryRes.candidates);

							if (page >= queryRes.numPages) break;
						} catch (error) {
							if (error instanceof RetryLaterError || continuation) throw error;
							appLogger.error("Search rover deep query encountered error", {
								component: "search-rover",
								keyword: task.keyword,
								order: task.order,
								days: task.days,
								page,
								error,
							});
						}
					}
				});
			} else if (isExplicitOrders) {
				// Explicit custom orders (sequential or deterministic steps respecting offset checkpoint)
				const orders = config.orders ?? DEFAULT_INCREMENTAL_ORDERS;
				const maxPages = config.pagesPerQuery ?? 1;
				let stepIndex = 0;

				for (const keyword of keywords) {
					for (const order of orders) {
						for (let page = 1; page <= maxPages; page++) {
							const currentStep = ++stepIndex;
							if (currentStep <= (continuation?.offset ?? 0)) continue;

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

								const queryRes = await this.runSearchQueryDetailed(keyword, {
									order,
									page,
									from: config.from,
									to: config.to,
									categoryId: config.categoryId,
								});

								await continuation?.onPage(queryRes.candidates, currentStep);
								addCandidates(queryRes.candidates);

								if (queryRes.candidates.length === 0 || page >= queryRes.numPages) {
									break;
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
			} else {
				// Incremental Mode: pubdate + sliding 'to' window + 10-minute exploration ledger
				const maxPages = config.pagesPerQuery ?? 50;
				const lookbackDays = config.timeWindowDays ?? 7;
				const nowSec = Math.floor(Date.now() / 1000);
				const defaultFromSec =
					config.from !== undefined
						? toUnixTimestamp(config.from)
						: nowSec - lookbackDays * 86400;
				const defaultToSec = config.to !== undefined ? toUnixTimestamp(config.to) : nowSec;

				let stepIndex = 0;
				await runWithConcurrency(keywords, concurrency, async (keyword) => {
					let startFrom = defaultFromSec;

					// If repository is present, find unexplored gaps
					if (this.discoveryRepo) {
						const fromSlot =
							Math.floor(defaultFromSec / WINDOW_SIZE_SECONDS) * WINDOW_SIZE_SECONDS;
						const toSlot =
							Math.floor(defaultToSec / WINDOW_SIZE_SECONDS) * WINDOW_SIZE_SECONDS;
						const explored = await this.discoveryRepo.getExploredSearchWindows(
							keyword,
							fromSlot,
							toSlot
						);

						let earliestUnexplored: number | null = null;
						for (let s = fromSlot; s <= toSlot; s += WINDOW_SIZE_SECONDS) {
							if (!explored.has(s)) {
								earliestUnexplored = s;
								break;
							}
						}

						if (earliestUnexplored === null) {
							appLogger.debug("Search rover skipped fully explored keyword", {
								component: "search-rover",
								keyword,
								fromSlot,
								toSlot,
							});
							return;
						}

						startFrom = earliestUnexplored;
					}

					let currentTo = defaultToSec;
					while (currentTo > startFrom) {
						let batchOldestTime = currentTo;
						let reachedEnd = false;
						let queryFailed = false;

						for (let page = 1; page <= maxPages; page++) {
							const currentStep = ++stepIndex;
							if (currentStep <= (continuation?.offset ?? 0)) continue;

							try {
								await onProgress?.({
									stage: "searching",
									target: keyword,
									order: "pubdate",
									page,
									candidates: allCandidates.length,
									queued: 0,
									updatedAt: new Date().toISOString(),
								});

								const queryRes = await this.runSearchQueryDetailed(keyword, {
									order: "pubdate",
									page,
									from: startFrom,
									to: currentTo,
									categoryId: config.categoryId,
								});

								if (queryRes.failed) {
									queryFailed = true;
									break;
								}

								if (queryRes.candidates.length === 0) {
									reachedEnd = true;
									break;
								}

								await continuation?.onPage(queryRes.candidates, currentStep);
								addCandidates(queryRes.candidates);

								for (const cand of queryRes.candidates) {
									if (cand.pubdate) {
										const epoch = Math.floor(
											cand.pubdate.epochMilliseconds / 1000
										);
										if (epoch < batchOldestTime) batchOldestTime = epoch;
									}
								}

								if (page >= queryRes.numPages) {
									reachedEnd = true;
									break;
								}
							} catch (error) {
								queryFailed = true;
								if (error instanceof RetryLaterError || continuation) throw error;
								appLogger.error(
									"Search rover incremental query encountered error",
									{
										component: "search-rover",
										keyword,
										order: "pubdate",
										page,
										error,
									}
								);
								break;
							}
						}

						if (queryFailed) {
							break;
						}

						if (reachedEnd || batchOldestTime <= startFrom) {
							await this.markSlotsExplored(keyword, startFrom, currentTo);
							break;
						}

						// Page cap reached before hitting startFrom: mark explored portion and slide 'to' backward
						await this.markSlotsExplored(keyword, batchOldestTime, currentTo);
						currentTo =
							batchOldestTime < currentTo
								? batchOldestTime
								: currentTo - WINDOW_SIZE_SECONDS;
					}
				});
			}

			appLogger.info("Search rover sweep completed", {
				component: "search-rover",
				keywordsCount: keywords.length,
				uniqueDiscovered: allCandidates.length,
				mode: config.mode ?? "incremental",
			});

			if (!continuation) {
				await onProgress?.({
					stage: "searching",
					target: null,
					candidates: allCandidates.length,
					queued: 0,
					updatedAt: new Date().toISOString(),
				});
			}

			return allCandidates;
		});
	}
}
