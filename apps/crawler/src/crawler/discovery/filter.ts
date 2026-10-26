import { appLogger } from "@cvsa/logger";
import type { ClassifierPrediction, VideoClassifierClient } from "./classifier";

export interface FilterDecision {
	action: "accept" | "reject";
	reason:
		| "whitelist_hit"
		| "model_hit"
		| "model_rejected"
		| "duration_out_of_range"
		| "blacklist_hit"
		| "model_unavailable";
	sampled: boolean;
	confidence: number;
	/** Present when the classifier ran; absent for rule-only decisions. */
	model?: ClassifierPrediction;
}

export interface DiscoveryFilterConfig {
	whitelistSingers: string[];
	whitelistSongIndicators: string[];
	blacklistKeywords: string[];
	minDurationSeconds: number;
	maxDurationSeconds: number;
	rejectionSampleRate: number; // e.g. 0.05 (5%)
	/** Run the classifier for candidates the rules cannot settle. */
	modelEnabled: boolean;
	/** Minimum `1 - P(not a song)` required to accept. */
	modelThreshold: number; // e.g. 0.5
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
	modelEnabled: true,
	modelThreshold: 0.5,
};

/** Runtime-config key holding the persisted discovery filter document. */
export const DISCOVERY_FILTER_CONFIG_KEY = "discovery";

/** Narrow an unknown JSON document into a plain record without asserting. */
function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return Object.fromEntries(Object.entries(value));
}

/**
 * The subset of the discovery repository the filter needs. Kept structural so
 * tests can persist into an in-memory map instead of a database.
 */
export interface DiscoveryFilterConfigStore {
	getRuntimeConfig(key: string): Promise<{ revision: number; config: unknown } | null>;
	saveRuntimeConfig(
		key: string,
		config: unknown,
		expectedRevision?: number
	): Promise<{ revision: number; config: unknown }>;
}

/**
 * Coerces a persisted document back into a complete config.
 *
 * Persisted config is operator input that survived a restart, so a stale or
 * hand-edited document must not be able to delete whitelist entries or set a
 * negative duration. Unknown/invalid fields fall back to the defaults.
 */
export function normalizeFilterConfig(input: unknown): DiscoveryFilterConfig {
	const source = asRecord(input) ?? {};
	const config = { ...DEFAULT_FILTER_CONFIG };

	const stringArray = (value: unknown, fallback: string[]): string[] => {
		if (!Array.isArray(value)) return fallback;
		const items = value.filter((item): item is string => typeof item === "string");
		return items.length > 0 ? items : fallback;
	};
	const positiveInt = (value: unknown, fallback: number): number => {
		if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
		return Math.round(value);
	};
	const ratio = (value: unknown, fallback: number): number => {
		if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
		return Math.min(1, Math.max(0, value));
	};

	config.whitelistSingers = stringArray(source.whitelistSingers, config.whitelistSingers);
	config.whitelistSongIndicators = stringArray(
		source.whitelistSongIndicators,
		config.whitelistSongIndicators
	);
	config.blacklistKeywords = stringArray(source.blacklistKeywords, config.blacklistKeywords);
	config.minDurationSeconds = positiveInt(source.minDurationSeconds, config.minDurationSeconds);
	config.maxDurationSeconds = positiveInt(source.maxDurationSeconds, config.maxDurationSeconds);
	if (config.maxDurationSeconds <= config.minDurationSeconds) {
		config.maxDurationSeconds = DEFAULT_FILTER_CONFIG.maxDurationSeconds;
		config.minDurationSeconds = DEFAULT_FILTER_CONFIG.minDurationSeconds;
	}
	config.rejectionSampleRate = ratio(source.rejectionSampleRate, config.rejectionSampleRate);
	config.modelEnabled =
		typeof source.modelEnabled === "boolean" ? source.modelEnabled : config.modelEnabled;
	config.modelThreshold = ratio(source.modelThreshold, config.modelThreshold);

	return config;
}

export class DiscoveryFilterService {
	private config: DiscoveryFilterConfig;
	private store: DiscoveryFilterConfigStore | undefined;
	/** Serializes persisted writes so a rapid burst cannot lose an update. */
	private persistChain: Promise<void> = Promise.resolve();

	constructor(config: Partial<DiscoveryFilterConfig> = {}, store?: DiscoveryFilterConfigStore) {
		this.config = { ...DEFAULT_FILTER_CONFIG, ...config };
		this.store = store;
	}

	/** Attach (or replace) the persistence backend. */
	attachStore(store: DiscoveryFilterConfigStore): void {
		this.store = store;
	}

	/**
	 * Load the persisted document, if any. Called once by the runtime at start so
	 * operator edits survive restarts; safe to call repeatedly.
	 */
	async initialize(): Promise<void> {
		if (!this.store) return;
		try {
			const stored = await this.store.getRuntimeConfig(DISCOVERY_FILTER_CONFIG_KEY);
			if (!stored) return;
			this.config = normalizeFilterConfig(stored.config);
			appLogger.info("Discovery filter config restored from runtime storage", {
				component: "discovery-filter",
				revision: stored.revision,
			});
		} catch (error) {
			appLogger.warn("Failed to load persisted discovery filter config; using defaults", {
				component: "discovery-filter",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Apply an in-memory update and persist it in the background.
	 *
	 * Deliberately synchronous: the control-plane route reads `getConfig()` back
	 * immediately, so the in-memory value must be current before the write lands.
	 * Persistence failures are logged, never thrown into the request path.
	 */
	updateConfig(update: Partial<DiscoveryFilterConfig>): void {
		this.config = { ...this.config, ...update };
		void this.persist();
	}

	/** Awaitable variant used by tests and by shutdown paths. */
	async updateConfigPersisted(update: Partial<DiscoveryFilterConfig>): Promise<void> {
		this.config = { ...this.config, ...update };
		await this.persist();
	}

	/** Flush any queued writes; resolves once the latest config is durable. */
	async flush(): Promise<void> {
		await this.persistChain;
	}

	getConfig(): DiscoveryFilterConfig {
		return { ...this.config };
	}

	private persist(): Promise<void> {
		const store = this.store;
		if (!store) return Promise.resolve();
		const config = this.getConfig();
		this.persistChain = this.persistChain
			.then(async () => {
				await store.saveRuntimeConfig(DISCOVERY_FILTER_CONFIG_KEY, config);
			})
			.catch((error) => {
				appLogger.warn("Failed to persist discovery filter config", {
					component: "discovery-filter",
					error: error instanceof Error ? error.message : String(error),
				});
			});
		return this.persistChain;
	}

	/**
	 * Rule-only decision. Kept synchronous because it is used where no classifier
	 * is available (unit tests, tooling); the pipeline calls
	 * {@link evaluateCandidate}, which adds the classifier stage.
	 */
	evaluateVideo(input: {
		title: string;
		tags: string[];
		description?: string | null;
		duration?: number;
	}): FilterDecision {
		const rules = this.evaluateRules(input);
		if (rules.decision) {
			return rules.decision;
		}

		// Rules cannot settle it and no classifier was supplied: keep the legacy
		// "singer mentioned, nothing negative" heuristic.
		if (rules.matchedSinger) {
			return {
				action: "accept",
				reason: "model_hit",
				sampled: false,
				confidence: 0.85,
			};
		}

		return this.rejectByModel(input.title, "model_rejected", 0.2);
	}

	/**
	 * Full decision used by the discovery pipeline: deterministic hard rules
	 * first, then the classifier for everything else.
	 *
	 * Precedence mirrors the legacy stack (`classifyVideoWorker`), where a hard
	 * non-zero label meant "song":
	 *   1. duration outside the window    -> reject
	 *   2. blacklist keyword              -> reject
	 *   3. strong whitelist (singer + indicator, no blacklist) -> accept
	 *   4. classifier: P(song) >= threshold -> accept, else reject
	 *   5. classifier unavailable -> legacy singer-only heuristic, flagged
	 *      `model_unavailable` so the decision is auditable
	 */
	async evaluateCandidate(
		input: {
			title: string;
			tags: string[];
			description?: string | null;
			duration?: number;
			aid?: bigint;
		},
		classifier: VideoClassifierClient | undefined
	): Promise<FilterDecision> {
		const rules = this.evaluateRules(input);
		if (rules.decision) {
			return rules.decision;
		}

		if (this.config.modelEnabled && classifier) {
			const prediction = await classifier.classify({
				title: input.title,
				description: input.description,
				tags: input.tags,
				aid: input.aid,
			});

			if (prediction) {
				const accepted = prediction.songProbability >= this.config.modelThreshold;
				const decision: FilterDecision = {
					action: accepted ? "accept" : "reject",
					reason: accepted ? "model_hit" : "model_rejected",
					sampled: accepted ? false : Math.random() < this.config.rejectionSampleRate,
					confidence: prediction.songProbability,
					model: prediction,
				};
				appLogger.debug("Discovery candidate classified", {
					component: "discovery-filter",
					title: input.title,
					label: prediction.label,
					songProbability: prediction.songProbability,
					threshold: this.config.modelThreshold,
					action: decision.action,
				});
				return decision;
			}

			// Service down: fall through to the heuristic, but never pretend the
			// model produced this decision.
			if (rules.matchedSinger) {
				return {
					action: "accept",
					reason: "model_unavailable",
					sampled: false,
					confidence: 0.6,
				};
			}
			return this.rejectByModel(input.title, "model_unavailable", 0.2);
		}

		if (rules.matchedSinger) {
			return {
				action: "accept",
				reason: "model_hit",
				sampled: false,
				confidence: 0.85,
			};
		}
		return this.rejectByModel(input.title, "model_rejected", 0.2);
	}

	/**
	 * The deterministic half of the decision. `decision` is set when a rule is
	 * conclusive; `matchedSinger` is reported so the caller can keep the legacy
	 * heuristic for border cases.
	 */
	private evaluateRules(input: {
		title: string;
		tags: string[];
		description?: string | null;
		duration?: number;
	}): { decision?: FilterDecision; matchedSinger: boolean } {
		const titleLower = input.title.toLowerCase();
		const descLower = (input.description ?? "").toLowerCase();
		const tagSet = new Set(input.tags.map((t) => t.toLowerCase()));

		// 1. Duration boundaries (songs are typically 45s - 15min)
		const duration = input.duration ?? 0;
		if (
			duration > 0 &&
			(duration < this.config.minDurationSeconds || duration > this.config.maxDurationSeconds)
		) {
			return {
				matchedSinger: false,
				decision: {
					action: "reject",
					reason: "duration_out_of_range",
					sampled: Math.random() < this.config.rejectionSampleRate,
					confidence: 0.0,
				},
			};
		}

		// 2. Blacklist keyword
		const hasBlacklistKeyword = this.config.blacklistKeywords.some(
			(kw) =>
				titleLower.includes(kw.toLowerCase()) ||
				descLower.includes(kw.toLowerCase()) ||
				tagSet.has(kw.toLowerCase())
		);

		// 3. Singer and song indicator whitelists
		const matchedSinger = this.config.whitelistSingers.find(
			(singer) =>
				titleLower.includes(singer.toLowerCase()) || tagSet.has(singer.toLowerCase())
		);

		const matchedIndicator = this.config.whitelistSongIndicators.find(
			(ind) => titleLower.includes(ind.toLowerCase()) || tagSet.has(ind.toLowerCase())
		);

		// A hard blacklist keyword outranks the whitelist: it is the operator's
		// explicit "this never belongs here" channel.
		if (hasBlacklistKeyword) {
			return {
				matchedSinger: matchedSinger !== undefined,
				decision: {
					action: "reject",
					reason: "blacklist_hit",
					sampled: Math.random() < this.config.rejectionSampleRate,
					confidence: 0.0,
				},
			};
		}

		if (
			matchedSinger &&
			(matchedIndicator ||
				tagSet.has("vocaloid中文曲") ||
				tagSet.has("synthesizer v") ||
				tagSet.has("vocaloid"))
		) {
			return {
				matchedSinger: true,
				decision: {
					action: "accept",
					reason: "whitelist_hit",
					sampled: false,
					confidence: 1.0,
				},
			};
		}

		return { matchedSinger: matchedSinger !== undefined };
	}

	private rejectByModel(
		title: string,
		reason: "model_rejected" | "model_unavailable",
		confidence: number
	): FilterDecision {
		const sampled = Math.random() < this.config.rejectionSampleRate;
		appLogger.debug("Discovery candidate rejected by filter", {
			component: "discovery-filter",
			title,
			reason,
			sampled,
		});
		return { action: "reject", reason, sampled, confidence };
	}
}
