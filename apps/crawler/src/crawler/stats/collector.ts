import { appLogger } from "@cvsa/logger";
import { toInstant } from "@cvsa/snapshot-db";
import type { CrawlerJobCounts } from "../shared/types";
import type { OverdueTrackingSummary } from "../tracking/repository.interface";
import type { StatsRollupStore } from "./rollup";
import {
	emptyCounters,
	emptyErrors,
	STATS_COUNTERS,
	STATS_ERROR_KINDS,
	STATS_LATENCY_KINDS,
	STATS_ROLLUP_METRIC_GROUP,
	STATS_WINDOWS,
	type StatsCounter,
	type StatsCounters,
	type StatsErrorKind,
	type StatsErrors,
	type StatsLatencyKind,
	type StatsLatencyP95,
	type StatsNetworkOutcome,
	type StatsOverview,
	type StatsQueueSnapshot,
	type StatsRecorder,
	type StatsRollupMetrics,
	type StatsWindow,
	type StatsWindowMetrics,
} from "./types";

/** One minute per bucket: 1440 buckets per 24h, 10080 for 7d. */
const BUCKET_MS = 60_000;
const WINDOW_MS: Readonly<Record<StatsWindow, number>> = {
	"5m": 5 * BUCKET_MS,
	"15m": 15 * BUCKET_MS,
	"30m": 30 * BUCKET_MS,
	"1h": 60 * BUCKET_MS,
	"6h": 360 * BUCKET_MS,
	"24h": 1440 * BUCKET_MS,
	"7d": 7 * 1440 * BUCKET_MS,
};
const MAX_BUCKETS = Math.ceil(WINDOW_MS["7d"] / BUCKET_MS);

/**
 * Latency histogram upper bounds in milliseconds. P95 is reported as the first
 * bound whose cumulative count reaches 95% of the samples, which keeps the
 * collector's memory constant instead of retaining every measurement.
 */
const LATENCY_BOUNDS_MS = [
	1, 2, 5, 10, 25, 50, 100, 200, 350, 500, 750, 1_000, 2_000, 3_000, 5_000, 8_000, 13_000, 21_000,
	34_000, 60_000, 120_000, 300_000,
] as const;

interface Bucket {
	/** Epoch millisecond start of this slot. */
	start: number;
	counters: StatsCounters;
	errors: StatsErrors;
	retries: number;
	/** Histogram counts, index-aligned with {@link LATENCY_BOUNDS_MS}. */
	latency: Record<StatsLatencyKind, number[]>;
}

export interface StatsOverviewDeps {
	/** Aggregated queue depth across every crawler queue. */
	queueCounts?: () => Promise<CrawlerJobCounts[]>;
	countOverdue?: (now: ReturnType<typeof toInstant>) => Promise<OverdueTrackingSummary>;
}

export interface CrawlerStatsCollectorOptions {
	now?: () => number;
	overview?: StatsOverviewDeps;
	rollup?: StatsRollupStore;
}

function createBucket(start: number): Bucket {
	return {
		start,
		counters: emptyCounters(),
		errors: emptyErrors(),
		retries: 0,
		latency: {
			task: new Array(LATENCY_BOUNDS_MS.length).fill(0),
			api: new Array(LATENCY_BOUNDS_MS.length).fill(0),
			inference: new Array(LATENCY_BOUNDS_MS.length).fill(0),
		},
	};
}

function latencyBucketIndex(value: number): number {
	const bounded = Number.isFinite(value) ? Math.max(0, value) : 0;
	for (let i = 0; i < LATENCY_BOUNDS_MS.length; i++) {
		const upper = LATENCY_BOUNDS_MS[i];
		if (upper !== undefined && bounded <= upper) return i;
	}
	return LATENCY_BOUNDS_MS.length - 1;
}

function percentileFromHistogram(histogram: readonly number[], percentile: number): number {
	let total = 0;
	for (const count of histogram) total += count;
	if (total === 0) return 0;

	const target = Math.ceil(total * percentile);
	let cumulative = 0;
	for (let i = 0; i < histogram.length; i++) {
		cumulative += histogram[i] ?? 0;
		if (cumulative >= target) return LATENCY_BOUNDS_MS[i] ?? 0;
	}
	return LATENCY_BOUNDS_MS[LATENCY_BOUNDS_MS.length - 1] ?? 0;
}

function sumHistograms(histograms: ReadonlyArray<readonly number[]>): number[] {
	const total = new Array(LATENCY_BOUNDS_MS.length).fill(0);
	for (const histogram of histograms) {
		for (let i = 0; i < total.length; i++) {
			total[i] += histogram[i] ?? 0;
		}
	}
	return total;
}

function toErrorKind(outcome: StatsNetworkOutcome): StatsErrorKind | undefined {
	switch (outcome) {
		case "success":
			return undefined;
		case "timeout":
			return "timeout";
		case "rate_limited":
			return "rateLimited412Or429";
		case "business_error":
			return "bilibiliBusinessError";
		case "http_error":
			return "httpFailure";
		case "connection_error":
			return "networkFailure";
		case "other_error":
			return "networkOther";
	}
}

function toQueueSnapshot(counts: readonly CrawlerJobCounts[]): StatsQueueSnapshot {
	const total: StatsQueueSnapshot = {
		waiting: 0,
		active: 0,
		delayed: 0,
		failed: 0,
		completed: 0,
		inFlight: 0,
	};
	for (const entry of counts) {
		total.waiting += entry.waiting;
		total.active += entry.active;
		total.delayed += entry.delayed;
		total.failed += entry.failed;
		total.completed += entry.completed;
	}
	total.inFlight = total.active + total.waiting;
	return total;
}

/**
 * In-memory sliding-window metrics for the crawler.
 *
 * Everything is bucketed per minute and folded on read, so a `getOverviewStats`
 * call costs the same whether the window holds ten events or ten million. The
 * collector is intentionally dependency-free apart from the optional rollup
 * repository: it is safe to construct in tests and in the worker process.
 */
export class CrawlerStatsCollector implements StatsRecorder {
	private readonly buckets: Array<Bucket | undefined> = new Array(MAX_BUCKETS).fill(undefined);
	private readonly now: () => number;
	private readonly overviewDeps: StatsOverviewDeps;
	private readonly rollup: StatsRollupStore | undefined;
	private flushTimer: ReturnType<typeof setInterval> | undefined;

	constructor(options: CrawlerStatsCollectorOptions = {}) {
		this.now = options.now ?? (() => Date.now());
		this.overviewDeps = options.overview ?? {};
		this.rollup = options.rollup;
	}

	recordTask(latencyMs: number): void {
		this.observeLatency("task", latencyMs);
	}

	recordJobCompleted(count = 1): void {
		this.incrementCounter("jobsCompleted", count);
	}

	recordSnapshotsSaved(count = 1): void {
		this.incrementCounter("snapshotsSaved", count);
	}

	recordCandidatesScanned(count = 1): void {
		this.incrementCounter("candidatesScanned", count);
	}

	recordInference(latencyMs?: number, succeeded = true): void {
		this.incrementCounter("inferencesRun", 1);
		if (latencyMs !== undefined) this.observeLatency("inference", latencyMs);
		if (!succeeded) this.recordError("inferenceError");
	}

	recordNetworkRequest(latencyMs?: number, outcome: StatsNetworkOutcome = "success"): void {
		this.incrementCounter("networkRequests", 1);
		if (latencyMs !== undefined) this.observeLatency("api", latencyMs);
		const errorKind = toErrorKind(outcome);
		if (errorKind) this.recordError(errorKind);
	}

	recordRetry(count = 1): void {
		this.bucket().retries += count;
	}

	recordError(kind: StatsErrorKind): void {
		this.bucket().errors[kind] += 1;
	}

	/** Fold every bucket inside `window` into a single snapshot. */
	getWindow(window: StatsWindow, nowMs = this.now()): StatsWindowMetrics {
		const from = nowMs - WINDOW_MS[window];
		const counters = emptyCounters();
		const errors = emptyErrors();
		const latency: Record<StatsLatencyKind, number[][]> = { task: [], api: [], inference: [] };
		let retries = 0;

		const firstSlot = Math.floor(from / BUCKET_MS);
		const lastSlot = Math.floor(nowMs / BUCKET_MS);
		for (let slot = firstSlot; slot <= lastSlot; slot++) {
			const bucket = this.buckets[((slot % MAX_BUCKETS) + MAX_BUCKETS) % MAX_BUCKETS];
			if (!bucket || bucket.start !== slot * BUCKET_MS) continue;
			for (const counter of STATS_COUNTERS) counters[counter] += bucket.counters[counter];
			for (const kind of STATS_ERROR_KINDS) errors[kind] += bucket.errors[kind];
			retries += bucket.retries;
			for (const kind of STATS_LATENCY_KINDS) latency[kind].push(bucket.latency[kind]);
		}

		const latencyP95Ms: StatsLatencyP95 = {
			task: percentileFromHistogram(sumHistograms(latency.task), 0.95),
			api: percentileFromHistogram(sumHistograms(latency.api), 0.95),
			inference: percentileFromHistogram(sumHistograms(latency.inference), 0.95),
		};

		return { window, counters, errors, retries, latencyP95Ms };
	}

	/**
	 * Admin-console payload: sliding window metrics plus live queue depth and
	 * tracking backlog. Both probes are optional so the collector still answers
	 * when no queue or repository is wired (tests, tooling).
	 */
	async getOverviewStats(window: StatsWindow): Promise<StatsOverview> {
		const nowMs = this.now();
		const metrics = this.getWindow(window, nowMs);

		let queueCounts: CrawlerJobCounts[] = [];
		if (this.overviewDeps.queueCounts) {
			try {
				queueCounts = await this.overviewDeps.queueCounts();
			} catch (error) {
				appLogger.warn("Failed to read queue counts for the stats overview", {
					component: "crawler-stats",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		let tracking: OverdueTrackingSummary = { overdueCount: 0, maxOverdueLagSec: 0 };
		if (this.overviewDeps.countOverdue) {
			try {
				tracking = await this.overviewDeps.countOverdue(toInstant(new Date(nowMs)));
			} catch (error) {
				appLogger.warn("Failed to read tracking backlog for the stats overview", {
					component: "crawler-stats",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			window,
			generatedAt: new Date(nowMs).toISOString(),
			metrics,
			queue: toQueueSnapshot(queueCounts),
			tracking,
		};
	}

	/** Every window's metrics, used by {@link flush}. */
	getAllWindows(nowMs = this.now()): Record<StatsWindow, StatsWindowMetrics> {
		return {
			"5m": this.getWindow("5m", nowMs),
			"15m": this.getWindow("15m", nowMs),
			"30m": this.getWindow("30m", nowMs),
			"1h": this.getWindow("1h", nowMs),
			"6h": this.getWindow("6h", nowMs),
			"24h": this.getWindow("24h", nowMs),
			"7d": this.getWindow("7d", nowMs),
		};
	}

	/**
	 * Persist one summary row per window into `crawler_stats_rollup`, truncated
	 * to the minute so repeated flushes in the same minute upsert one row.
	 */
	async flush(nowMs = this.now()): Promise<number> {
		if (!this.rollup) return 0;
		const bucketTime = toInstant(new Date(Math.floor(nowMs / BUCKET_MS) * BUCKET_MS));
		const windows = this.getAllWindows(nowMs);
		const queueCounts = this.overviewDeps.queueCounts
			? await this.overviewDeps.queueCounts().catch(() => [])
			: [];
		const queue = toQueueSnapshot(queueCounts);
		const tracking = this.overviewDeps.countOverdue
			? await this.overviewDeps
					.countOverdue(toInstant(new Date(nowMs)))
					.catch(() => ({ overdueCount: 0, maxOverdueLagSec: 0 }))
			: undefined;

		let written = 0;
		for (const window of STATS_WINDOWS) {
			const metrics = windows[window];
			const payload: StatsRollupMetrics = {
				counters: metrics.counters,
				errors: metrics.errors,
				retries: metrics.retries,
				latencyP95Ms: metrics.latencyP95Ms,
				...(queueCounts.length > 0 ? { queue } : {}),
				...(tracking ? { tracking } : {}),
			};
			await this.rollup.saveRollup({
				bucketTime,
				metricGroup: `${STATS_ROLLUP_METRIC_GROUP}:${window}`,
				metrics: payload,
			});
			written++;
		}

		appLogger.debug("Flushed crawler stats rollup", {
			component: "crawler-stats",
			bucketTime: bucketTime.toString(),
			rows: written,
		});

		return written;
	}

	startPeriodicFlush(intervalMs = 60_000): void {
		if (this.flushTimer || !this.rollup) return;
		this.flushTimer = setInterval(() => {
			void this.flush().catch((error) => {
				appLogger.warn("Periodic crawler stats flush failed", {
					component: "crawler-stats",
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, intervalMs);
		appLogger.info("Crawler stats periodic flush started", {
			component: "crawler-stats",
			intervalMs,
		});
	}

	stopPeriodicFlush(): void {
		if (!this.flushTimer) return;
		clearInterval(this.flushTimer);
		this.flushTimer = undefined;
	}

	/** Historical series for the admin console charts. */
	async getHistory(
		window: StatsWindow,
		since: Date,
		limit = 240
	): Promise<Array<{ bucketTime: string; metrics: StatsRollupMetrics | null }>> {
		if (!this.rollup) return [];
		const rows = await this.rollup.listRollup(
			`${STATS_ROLLUP_METRIC_GROUP}:${window}`,
			toInstant(since),
			limit
		);
		return rows.map((row) => ({
			bucketTime: row.bucketTime.toString(),
			metrics: row.metrics,
		}));
	}

	private bucket(nowMs = this.now()): Bucket {
		const slot = Math.floor(nowMs / BUCKET_MS);
		const start = slot * BUCKET_MS;
		const index = ((slot % MAX_BUCKETS) + MAX_BUCKETS) % MAX_BUCKETS;
		const existing = this.buckets[index];
		if (existing && existing.start === start) return existing;

		const created = createBucket(start);
		this.buckets[index] = created;
		return created;
	}

	private incrementCounter(counter: StatsCounter, count: number): void {
		if (count === 0) return;
		this.bucket().counters[counter] += count;
	}

	private observeLatency(kind: StatsLatencyKind, latencyMs: number): void {
		const bucket = this.bucket();
		bucket.latency[kind][latencyBucketIndex(latencyMs)] += 1;
	}
}
