import {
	CrawlerStatsCountersSchema,
	CrawlerStatsErrorsSchema,
	type CrawlerStatsWindow,
	type CrawlerMinuteMetrics,
	type CrawlerStatsCounters,
	type CrawlerStatsErrors,
} from "@cvsa/contracts";
import type { CrawlerJobCounts } from "../shared/types";
import type { OverdueTrackingSummary } from "../tracking/repository.interface";

export type StatsWindow = CrawlerStatsWindow;
export const STATS_COUNTERS = CrawlerStatsCountersSchema.keyof().options;
export type StatsCounter = keyof CrawlerStatsCounters;
export const STATS_ERROR_KINDS = CrawlerStatsErrorsSchema.keyof().options;
export type StatsErrorKind = keyof CrawlerStatsErrors;

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

export type StatsCounters = CrawlerStatsCounters;
export type StatsErrors = CrawlerStatsErrors;
export type StatsLatencyP95 = Record<StatsLatencyKind, number>;

/** One sliding window's aggregate. */
export interface StatsWindowMetrics {
	gauges?: CrawlerMinuteMetrics["gauges"];
	window: StatsWindow;
	from: number;
	to: number;
	jobs: CrawlerMinuteMetrics["jobs"];
	network: CrawlerMinuteMetrics["network"];
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

export type StatsRollupMetrics = CrawlerMinuteMetrics;

/**
 * The recording surface consumers depend on.
 *
 * Narrower than {@link CrawlerStatsCollector} so pipeline components can be
 * handed a recorder (or a no-op stub) without importing the collector, and so
 * tests can assert on recorded events.
 */
export interface StatsRecorder {
	recordCount(counter: StatsCounter, count?: number): void;
	recordJobOutcome(
		queue: "tracking" | "discovery",
		outcome: "completed" | "failed" | "deferred"
	): void;
	recordTask(latencyMs: number): void;
	recordJobCompleted(count?: number): void;
	recordSnapshotsSaved(count?: number): void;
	recordVideosDiscovered(count?: number): void;
	recordCandidatesScanned(count?: number): void;
	recordInference(latencyMs?: number, succeeded?: boolean): void;
	recordNetworkRequest(
		latencyMs?: number,
		outcome?: StatsNetworkOutcome,
		attributes?: Record<string, string | number>
	): void;
	recordRetry(count?: number): void;
	recordError(kind: StatsErrorKind): void;
}

/** No-op recorder for call sites that run without stats collection. */
export function createNoopStatsRecorder(): StatsRecorder {
	return {
		recordCount() {},
		recordJobOutcome() {},
		recordTask() {},
		recordJobCompleted() {},
		recordSnapshotsSaved() {},
		recordVideosDiscovered() {},
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
		videosDiscovered: 0,
		candidatesScanned: 0,
		inferencesRun: 0,
		networkRequests: 0,
		aidsRequested: 0,
		aidsReturned: 0,
		aidsMissing: 0,
		candidatesSeen: 0,
		candidatesSkipped: 0,
		candidatesRejected: 0,
		candidatesFailed: 0,
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
		from: 0,
		to: 0,
		jobs: {
			tracking: { completed: 0, failed: 0, deferred: 0 },
			discovery: { completed: 0, failed: 0, deferred: 0 },
		},
		network: {},
		counters: emptyCounters(),
		errors: emptyErrors(),
		retries: 0,
		latencyP95Ms: emptyLatencyP95(),
	};
}
