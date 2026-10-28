import type { CrawlerJobCounts } from "../shared/types";
import type { OverdueTrackingSummary } from "../tracking/repository.interface";

export type StatsWindow = "5m" | "1h" | "24h";

export const STATS_WINDOWS: readonly StatsWindow[] = ["5m", "1h", "24h"];

/** Throughput counters tracked per window. */
export const STATS_COUNTERS = [
	"jobsCompleted",
	"snapshotsSaved",
	"candidatesScanned",
	"inferencesRun",
	"networkRequests",
] as const;

export type StatsCounter = (typeof STATS_COUNTERS)[number];

/** Error taxonomy surfaced by the admin console's health panel. */
export const STATS_ERROR_KINDS = [
	"timeout",
	"networkFailure",
	"httpFailure",
	"networkOther",
	"adapterUnavailable",
	"rateLimited412Or429",
	"bilibiliBusinessError",
	"inferenceError",
	"dbError",
	"other",
] as const;

export type StatsErrorKind = (typeof STATS_ERROR_KINDS)[number];

export type StatsLatencyKind = "task" | "api" | "inference";

export const STATS_LATENCY_KINDS: readonly StatsLatencyKind[] = ["task", "api", "inference"];

/** Normalized network outcome the collector maps onto {@link StatsErrorKind}. */
export type StatsNetworkOutcome =
	| "success"
	| "timeout"
	| "rate_limited"
	| "business_error"
	| "http_error"
	| "connection_error"
	| "other_error";

export type StatsCounters = Record<StatsCounter, number>;
export type StatsErrors = Record<StatsErrorKind, number>;
export type StatsLatencyP95 = Record<StatsLatencyKind, number>;

/** One sliding window's aggregate. */
export interface StatsWindowMetrics {
	window: StatsWindow;
	counters: StatsCounters;
	errors: StatsErrors;
	retries: number;
	latencyP95Ms: StatsLatencyP95;
}

/** Queue depth, mirrored from BullMQ `getJobCounts()`. */
export interface StatsQueueSnapshot extends CrawlerJobCounts {
	/** `active + waiting`, i.e. the number the dispatcher's queue cap limits. */
	inFlight: number;
}

export interface StatsOverview {
	window: StatsWindow;
	/** ISO-8601 instant the snapshot was taken. */
	generatedAt: string;
	metrics: StatsWindowMetrics;
	queue: StatsQueueSnapshot;
	tracking: OverdueTrackingSummary;
}

/** Payload persisted into `crawler_stats_rollup.metrics`. */
export interface StatsRollupMetrics {
	counters: StatsCounters;
	errors: StatsErrors;
	retries: number;
	latencyP95Ms: StatsLatencyP95;
	queue?: StatsQueueSnapshot;
	tracking?: OverdueTrackingSummary;
}

export const STATS_ROLLUP_METRIC_GROUP = "crawler" as const;

/**
 * The recording surface consumers depend on.
 *
 * Narrower than {@link CrawlerStatsCollector} so pipeline components can be
 * handed a recorder (or a no-op stub) without importing the collector, and so
 * tests can assert on recorded events.
 */
export interface StatsRecorder {
	recordTask(latencyMs: number): void;
	recordJobCompleted(count?: number): void;
	recordSnapshotsSaved(count?: number): void;
	recordCandidatesScanned(count?: number): void;
	recordInference(latencyMs?: number, succeeded?: boolean): void;
	recordNetworkRequest(latencyMs?: number, outcome?: StatsNetworkOutcome): void;
	recordRetry(count?: number): void;
	recordError(kind: StatsErrorKind): void;
}

/** No-op recorder for call sites that run without stats collection. */
export function createNoopStatsRecorder(): StatsRecorder {
	return {
		recordTask() {},
		recordJobCompleted() {},
		recordSnapshotsSaved() {},
		recordCandidatesScanned() {},
		recordInference() {},
		recordNetworkRequest() {},
		recordRetry() {},
		recordError() {},
	};
}

export function emptyCounters(): StatsCounters {
	return {
		jobsCompleted: 0,
		snapshotsSaved: 0,
		candidatesScanned: 0,
		inferencesRun: 0,
		networkRequests: 0,
	};
}

export function emptyErrors(): StatsErrors {
	return {
		timeout: 0,
		networkFailure: 0,
		httpFailure: 0,
		networkOther: 0,
		adapterUnavailable: 0,
		rateLimited412Or429: 0,
		bilibiliBusinessError: 0,
		inferenceError: 0,
		dbError: 0,
		other: 0,
	};
}

export function emptyLatencyP95(): StatsLatencyP95 {
	return { task: 0, api: 0, inference: 0 };
}

export function emptyWindowMetrics(window: StatsWindow): StatsWindowMetrics {
	return {
		window,
		counters: emptyCounters(),
		errors: emptyErrors(),
		retries: 0,
		latencyP95Ms: emptyLatencyP95(),
	};
}
