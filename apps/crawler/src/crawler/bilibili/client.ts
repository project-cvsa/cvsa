import type { BilibiliSessionConfig, BilibiliSessionStatus } from "@cvsa/contracts";
import { bilibiliPurpose } from "./requestContext";
import { getTaskSignal } from "../shared/taskContext";
import { appLogger } from "@cvsa/logger";
import { BilibiliSession } from "./session";
import { createQueryVerificationId, toUnixTimestamp } from "./signing";
import type {
	BilibiliClientOptions,
	BilibiliRelatedVideo,
	BilibiliRequest,
	BilibiliResponse,
	GetTopicFeedOptions,
	SearchVideosData,
	SearchVideosOptions,
	TopicFeedData,
	VideoDetailsData,
	VideoDetailsResponse,
	VideoDetailView,
	VideoStatsSnapshot,
	VideoViewResponse,
} from "./types";

const API_ORIGIN = "https://api.bilibili.com";

function createDefaultRequest(options: BilibiliClientOptions): BilibiliRequest {
	if (options.request) {
		return options.request;
	}

	if (options.networkDelegate) {
		const delegate = options.networkDelegate;
		return async (url, reqOptions) => {
			const res = await delegate.execute({
				url,
				requestType: `bilibili:${reqOptions?.purpose ?? bilibiliPurpose("details")}`,
				adapterId: reqOptions?.adapterId,
				signal: reqOptions?.signal ?? getTaskSignal(),
				method: reqOptions?.method ?? "GET",
				headers: reqOptions?.headers,
				body: reqOptions?.body,
				timeoutMs: reqOptions?.timeoutMs ?? options.requestTimeoutMs?.(),
				context: reqOptions?.context,
			});
			return {
				status: res.status,
				headers: res.headers,
				body: res.body,
			};
		};
	}

	return async (url, reqOptions) => {
		const signal = reqOptions?.signal ?? getTaskSignal();
		const res = await fetch(url, {
			signal: AbortSignal.any([
				AbortSignal.timeout(reqOptions?.timeoutMs ?? options.requestTimeoutMs?.() ?? 8000),
				...(signal ? [signal] : []),
			]),
			method: reqOptions?.method ?? "GET",
			headers: reqOptions?.headers,
			body: reqOptions?.body,
		});
		const headers: Record<string, string> = {};
		res.headers.forEach((value, key) => {
			headers[key.toLowerCase()] = value;
		});
		const body = await res.text();
		return {
			status: res.status,
			headers,
			body,
		};
	};
}

export class BilibiliClient {
	private readonly session: BilibiliSession;

	constructor(options: BilibiliClientOptions = {}) {
		const requestImpl = createDefaultRequest(options);
		this.session = new BilibiliSession(
			requestImpl,
			options.cache,
			options.sessionConfig,
			options.clock,
			options.random,
			options.requestTimeoutMs,
			options.operationTimeoutMs
		);
	}

	configureSession(config: BilibiliSessionConfig): void {
		this.session.configure(config);
	}
	getSessionStatus(): BilibiliSessionStatus {
		return this.session.getStatus();
	}
	start(): Promise<void> {
		return this.session.start();
	}
	stop(): Promise<void> {
		return this.session.stop();
	}
	refreshCredentials(): Promise<unknown> {
		return this.session.refreshCredentials();
	}
	invalidateCredentials(): Promise<void> {
		return this.session.invalidate();
	}
	diagnostic(adapterId: string) {
		return this.session.diagnostic(adapterId);
	}

	async searchVideos(
		keyword: string,
		options: SearchVideosOptions = {}
	): Promise<BilibiliResponse<SearchVideosData>> {
		if (!keyword.trim()) throw new Error("keyword must not be empty");
		const params: Record<string, string | number | boolean> = {
			category_id: options.categoryId ?? "",
			context: "",
			from_source: "web_search",
			highlight: 1,
			keyword,
			order: options.order ?? "totalrank",
			page: options.page ?? 1,
			page_size: options.pageSize ?? 20,
			platform: "pc",
			pubtime_begin_s: options.from === undefined ? 0 : toUnixTimestamp(options.from),
			pubtime_end_s: options.to === undefined ? 0 : toUnixTimestamp(options.to),
			search_type: "video",
			web_location: 1430654,
			qv_id: createQueryVerificationId(),
			...options.extraParams,
		};
		return this.session.signedRequest("/x/web-interface/wbi/search/type", params, {
			purpose: bilibiliPurpose("search"),
			headers: {
				Origin: "https://search.bilibili.com",
				Referer: `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
			},
			context: {
				endpoint: "video_search",
				keyword,
				page: options.page ?? 1,
			},
		});
	}

	async getTopicFeed(options: GetTopicFeedOptions): Promise<BilibiliResponse<TopicFeedData>> {
		const params = new URLSearchParams({
			topic_id: String(options.topicId),
			sort_by: String(options.sortBy ?? 3),
			page_size: String(options.pageSize ?? 20),
			features: "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard",
			web_location: "333.1035",
		});
		if (options.offset) {
			params.set("offset", options.offset);
		}
		return this.session.request(`${API_ORIGIN}/x/polymer/web-dynamic/v1/feed/topic?${params}`, {
			purpose: bilibiliPurpose("search"),
			headers: {
				Origin: "https://www.bilibili.com",
				Referer: "https://www.bilibili.com/",
			},
			context: {
				endpoint: "topic_feed",
				topicId: options.topicId,
			},
		});
	}

	async getVideoDetails(identifier: number | bigint | string): Promise<VideoDetailsData> {
		const byAid = typeof identifier === "number" || typeof identifier === "bigint";
		if (byAid && (!Number.isSafeInteger(Number(identifier)) || Number(identifier) <= 0)) {
			throw new Error("aid must be a positive safe integer");
		}
		const idStr = String(identifier);
		if (!byAid && !/^BV[0-9A-Za-z]{10}$/.test(idStr)) {
			throw new Error("bvid must be a valid BV identifier");
		}

		const idRef = byAid ? `av${identifier}` : idStr;
		const response = await this.session.signedRequest<VideoDetailsResponse>(
			"/x/web-interface/wbi/view/detail",
			{ ...(byAid ? { aid: Number(identifier) } : { bvid: idStr }), web_location: 1315875 },
			{
				purpose: bilibiliPurpose("details"),
				headers: {
					Origin: "https://www.bilibili.com",
					Referer: `https://www.bilibili.com/video/${idRef}/`,
				},
				context: {
					endpoint: "video_details",
					aid: byAid ? idStr : undefined,
					bvid: byAid ? undefined : idStr,
				},
			}
		);
		if (response.code !== 0) {
			const error = new Error(
				`Bilibili video details request failed: ${response.code} ${response.message}`
			);
			appLogger.error("Bilibili video details API error", {
				component: "bilibili-client",
				identifier: idStr,
				code: response.code,
				message: response.message,
				error,
			});
			throw error;
		}
		return response.data;
	}

	/**
	 * Fetch related recommended videos for a video (up to 40 items).
	 */
	async getRelatedVideos(identifier: number | bigint | string): Promise<BilibiliRelatedVideo[]> {
		const byAid = typeof identifier === "number" || typeof identifier === "bigint";
		if (byAid && (!Number.isSafeInteger(Number(identifier)) || Number(identifier) <= 0)) {
			throw new Error("aid must be a positive safe integer");
		}
		const idStr = String(identifier);
		if (!byAid && !/^BV[0-9A-Za-z]{10}$/.test(idStr)) {
			throw new Error("bvid must be a valid BV identifier");
		}

		const idRef = byAid ? `av${identifier}` : idStr;
		const query = new URLSearchParams(byAid ? { aid: idStr } : { bvid: idStr });
		const response = await this.session.request<BilibiliResponse<BilibiliRelatedVideo[]>>(
			`${API_ORIGIN}/x/web-interface/archive/related?${query}`,
			{
				headers: {
					Origin: "https://www.bilibili.com",
					Referer: `https://www.bilibili.com/video/${idRef}/`,
				},
				context: {
					endpoint: "related_videos",
					aid: byAid ? idStr : undefined,
					bvid: byAid ? undefined : idStr,
				},
			}
		);
		if (response.code !== 0 || !Array.isArray(response.data)) {
			const error = new Error(
				`Bilibili related videos request failed: ${response.code} ${response.message}`
			);
			appLogger.error("Bilibili related videos API error", {
				component: "bilibili-client",
				identifier: idStr,
				code: response.code,
				message: response.message,
				error,
			});
			throw error;
		}
		return response.data;
	}

	/**
	 * Fetch the public video view payload without WBI signing or session credentials.
	 */
	async getVideoView(identifier: number | bigint | string): Promise<VideoDetailView> {
		const byAid = typeof identifier === "number" || typeof identifier === "bigint";
		if (byAid && (!Number.isSafeInteger(Number(identifier)) || Number(identifier) <= 0)) {
			throw new Error("aid must be a positive safe integer");
		}
		const idStr = String(identifier);
		if (!byAid && !/^BV[0-9A-Za-z]{10}$/.test(idStr)) {
			throw new Error("bvid must be a valid BV identifier");
		}

		const query = new URLSearchParams(byAid ? { aid: idStr } : { bvid: idStr });
		const response = await this.session.request<VideoViewResponse>(
			`${API_ORIGIN}/x/web-interface/view?${query}`,
			{
				headers: {
					Origin: "https://www.bilibili.com",
					Referer: "https://www.bilibili.com/",
				},
				context: {
					endpoint: "video_view",
					aid: byAid ? idStr : undefined,
					bvid: byAid ? undefined : idStr,
				},
			}
		);
		if (response.code !== 0 || !response.data) {
			const error = new Error(
				`Bilibili video view request failed: ${response.code} ${response.message}`
			);
			appLogger.error("Bilibili video view API error", {
				component: "bilibili-client",
				identifier: idStr,
				code: response.code,
				message: response.message,
				error,
			});
			throw error;
		}
		return response.data;
	}

	async bulkGetVideoStats(
		aids: Array<number | bigint | string>
	): Promise<{ data: VideoStatsSnapshot[]; time: number } | number> {
		const uniqueAids = [...new Set(aids.map((aid) => String(aid)))];
		if (uniqueAids.length === 0) return { data: [], time: Date.now() };

		const response = await this.session.request<
			BilibiliResponse<Array<{ id: number; cnt_info: Record<string, number> }>>
		>(
			`${API_ORIGIN}/medialist/gateway/base/resource/infos?resources=${uniqueAids.map((aid) => `${aid}:2`).join(",")}`,
			{
				purpose: "tracking",
				headers: {
					Origin: "https://www.bilibili.com",
					Referer: "https://www.bilibili.com/",
				},
				context: {
					endpoint: "video_stats",
					batchSize: uniqueAids.length,
					sampleAids: uniqueAids.slice(0, 5),
				},
			}
		);

		if (response.code !== 0) {
			appLogger.warn("Bilibili bulk video stats request failed with API code", {
				component: "bilibili-client",
				code: response.code,
				message: response.message,
				requested: uniqueAids.length,
				sampleAids: uniqueAids.slice(0, 5),
			});
			return response.code;
		}

		return {
			time: Date.now(),
			data: response.data.map(({ id, cnt_info: stats }) => ({
				aid: id,
				views: stats.play ?? 0,
				danmakus: stats.danmaku ?? 0,
				replies: stats.reply ?? 0,
				likes: stats.thumb_up ?? 0,
				coins: stats.coin ?? 0,
				shares: stats.share ?? 0,
				favorites: stats.collect ?? 0,
			})),
		};
	}
}
