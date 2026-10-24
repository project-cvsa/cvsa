import { appLogger } from "@cvsa/logger";

export interface FilterDecision {
	action: "accept" | "reject";
	reason: "whitelist_hit" | "model_hit" | "model_rejected" | "duration_out_of_range";
	sampled: boolean;
	confidence: number;
}

export interface DiscoveryFilterConfig {
	whitelistSingers: string[];
	whitelistSongIndicators: string[];
	blacklistKeywords: string[];
	minDurationSeconds: number;
	maxDurationSeconds: number;
	rejectionSampleRate: number; // e.g. 0.05 (5%)
}

export const DEFAULT_FILTER_CONFIG: DiscoveryFilterConfig = {
	whitelistSingers: [
		"洛天依",
		"言和",
		"乐正绫",
		"徵羽摩柯",
		"墨清弦",
		"弱音",
		"初音未来",
		"初音ミク",
		"星尘",
		"诗岸",
		"海伊",
		"苍穹",
		"Minus",
		"沨漪",
		"赤羽",
		"艾可",
		"牧心",
		"青溯",
		"幻晓蝶",
		"巡音流歌",
		"巡音ルカ",
		"镜音双子",
		"镜音连",
		"镜音铃",
		"重音Teto",
		"重音テト",
		"花隈千冬",
		"小春六花",
		"夏语遥",
		"心华",
		"东方栀子",
		"虚拟歌手",
		"虚拟歌姬",
		"中文VOCALOID",
		"VOCALOID",
		"Synthesizer V",
		"CeVIO",
		"ACE Studio",
		"VOICEROID",
	],
	whitelistSongIndicators: [
		"原创",
		"原创曲",
		"原创单曲",
		"首发",
		"曲绘",
		"pv",
		"调教",
		"调教用",
		"本家",
		"中文曲",
	],
	blacklistKeywords: [
		"原神",
		"王者荣耀",
		"和平精英",
		"搬运",
		"翻唱",
		"cover",
		"asmr",
		"音声",
		"直播录像",
		"录屏",
		"切片",
		"剪辑",
	],
	minDurationSeconds: 45,
	maxDurationSeconds: 900,
	rejectionSampleRate: 0.05,
};

export class DiscoveryFilterService {
	private config: DiscoveryFilterConfig;

	constructor(config: Partial<DiscoveryFilterConfig> = {}) {
		this.config = { ...DEFAULT_FILTER_CONFIG, ...config };
	}

	updateConfig(update: Partial<DiscoveryFilterConfig>): void {
		this.config = { ...this.config, ...update };
	}

	getConfig(): DiscoveryFilterConfig {
		return { ...this.config };
	}

	evaluateVideo(input: {
		title: string;
		tags: string[];
		description?: string | null;
		duration?: number;
	}): FilterDecision {
		const titleLower = input.title.toLowerCase();
		const descLower = (input.description ?? "").toLowerCase();
		const tagSet = new Set(input.tags.map((t) => t.toLowerCase()));

		// 1. Check duration boundaries (songs are typically 45s - 15min)
		const duration = input.duration ?? 0;
		if (
			duration > 0 &&
			(duration < this.config.minDurationSeconds || duration > this.config.maxDurationSeconds)
		) {
			const sampled = Math.random() < this.config.rejectionSampleRate;
			return {
				action: "reject",
				reason: "duration_out_of_range",
				sampled,
				confidence: 0.0,
			};
		}

		// 2. Check blacklist
		const hasBlacklistKeyword = this.config.blacklistKeywords.some(
			(kw) =>
				titleLower.includes(kw.toLowerCase()) ||
				descLower.includes(kw.toLowerCase()) ||
				tagSet.has(kw.toLowerCase())
		);

		// 3. Check singer match in title or tags
		const matchedSinger = this.config.whitelistSingers.find(
			(singer) =>
				titleLower.includes(singer.toLowerCase()) || tagSet.has(singer.toLowerCase())
		);

		// 4. Check song indicator in title or tags
		const matchedIndicator = this.config.whitelistSongIndicators.find(
			(ind) => titleLower.includes(ind.toLowerCase()) || tagSet.has(ind.toLowerCase())
		);

		// If strong whitelist hit: has singer and song indicator, and no hard blacklist
		if (
			matchedSinger &&
			(matchedIndicator ||
				tagSet.has("vocaloid中文曲") ||
				tagSet.has("synthesizer v") ||
				tagSet.has("vocaloid"))
		) {
			if (!hasBlacklistKeyword) {
				return {
					action: "accept",
					reason: "whitelist_hit",
					sampled: false,
					confidence: 1.0,
				};
			}
		}

		// 5. Model/heuristic evaluation for border cases:
		// If matched singer alone without blacklist, accept with moderate confidence
		if (matchedSinger && !hasBlacklistKeyword) {
			return {
				action: "accept",
				reason: "model_hit",
				sampled: false,
				confidence: 0.85,
			};
		}

		// 6. Rejected by model/heuristics
		const sampled = Math.random() < this.config.rejectionSampleRate;
		appLogger.debug("Discovery candidate rejected by filter", {
			component: "discovery-filter",
			title: input.title,
			sampled,
		});

		return {
			action: "reject",
			reason: "model_rejected",
			sampled,
			confidence: 0.2,
		};
	}
}
