import { appLogger } from "@cvsa/logger";
import {
	CRAWLER_LATENCY_BOUNDS_MS,
	CRAWLER_WINDOW_MINUTES,
	type CrawlerMinuteMetrics,
} from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { CrawlerJobCounts } from "../shared/types";
import type { OverdueTrackingSummary } from "../tracking/repository.interface";
import type { StatsRollupStore, StatsRollupRow } from "./rollup";
import { emptyMinute, mergeMinute, windowMetrics, chartMetrics } from "./aggregation";
import type {
	StatsCounter,
	StatsErrorKind,
	StatsLatencyKind,
	StatsNetworkOutcome,
	StatsRecorder,
	StatsWindow,
} from "./types";

const MINUTE_MS = 60_000;
export interface StatsOverviewDeps {
	queueCounts?: () => Promise<CrawlerJobCounts[]>;
	countOverdue?: (now: ReturnType<typeof toInstant>) => Promise<OverdueTrackingSummary>;
}
export interface CrawlerStatsCollectorOptions {
	now?: () => number;
	overview?: StatsOverviewDeps;
	rollup?: StatsRollupStore;
}

export class CrawlerStatsCollector implements StatsRecorder {
	private readonly buckets = new Map<number, CrawlerMinuteMetrics>();
	private readonly dirty = new Set<number>();
	private readonly sourceId = crypto.randomUUID();
	private readonly now: () => number;
	private readonly startedAt: number;
	private heartbeatAt: number;
	private readonly overviewDeps: StatsOverviewDeps;
	private readonly rollup: StatsRollupStore | undefined;
	private flushTimer: ReturnType<typeof setInterval> | undefined;
	private flushing: Promise<number> | undefined;

	constructor(options: CrawlerStatsCollectorOptions = {}) {
		this.now = options.now ?? Date.now;
		this.startedAt = this.now();
		this.heartbeatAt = this.startedAt;
		this.overviewDeps = options.overview ?? {};
		this.rollup = options.rollup;
	}

	recordCount(counter: StatsCounter, count = 1): void {
		this.bucket().counters[counter] += count;
	}
	recordJobCompleted(count = 1): void {
		this.recordCount("jobsCompleted", count);
	}
	recordJobOutcome(
		queue: "tracking" | "discovery",
		outcome: "completed" | "failed" | "deferred"
	): void {
		this.bucket().jobs[queue][outcome]++;
		if (outcome === "completed") this.recordJobCompleted();
	}
	recordSnapshotsSaved(count = 1): void {
		this.recordCount("snapshotsSaved", count);
	}
	recordVideosDiscovered(count = 1): void {
		this.recordCount("videosDiscovered", count);
	}
	recordCandidatesScanned(count = 1): void {
		this.recordCount("candidatesScanned", count);
	}
	recordTask(ms: number): void {
		this.observeLatency("task", ms);
	}
	recordInference(ms?: number, succeeded = true): void {
		this.recordCount("inferencesRun");
		if (ms !== undefined) this.observeLatency("inference", ms);
		if (!succeeded) this.recordError("inferenceError");
	}
	recordNetworkRequest(
		ms?: number,
		outcome: StatsNetworkOutcome = "success",
		attributes: Record<string, string | number> = {}
	): void {
		this.recordCount("networkRequests");
		if (ms !== undefined) this.observeLatency("api", ms);
		const errors: Record<Exclude<StatsNetworkOutcome, "success">, StatsErrorKind> = {
			timeout: "timeout",
			rate_limited: "rateLimited412Or429",
			business_error: "bilibiliBusinessError",
			http_error: "httpFailure",
			connection_error: "networkFailure",
			other_error: "networkOther",
		};
		if (outcome !== "success") this.recordError(errors[outcome]);
		for (const dimension of ["requestType", "endpoint", "egress"] as const) {
			const key = `${dimension}:${attributes[dimension] ?? "unknown"}`;
			const totals = this.bucket().network[key] ?? {
				requests: 0,
				success: 0,
				businessErrors: 0,
				rateLimited: 0,
				transportFailures: 0,
			};
			totals.requests++;
			if (outcome === "success") totals.success++;
			else if (outcome === "business_error") totals.businessErrors++;
			else if (outcome === "rate_limited") totals.rateLimited++;
			else totals.transportFailures++;
			this.bucket().network[key] = totals;
		}
	}
	recordRetry(count = 1): void {
		this.bucket().retries += count;
	}
	recordError(kind: StatsErrorKind): void {
		this.bucket().errors[kind]++;
	}

	private bucket(at = this.now()): CrawlerMinuteMetrics {
		const start = Math.floor(at / MINUTE_MS) * MINUTE_MS;
		let bucket = this.buckets.get(start);
		if (!bucket) {
			bucket = emptyMinute(Math.max(start, this.startedAt), at);
			this.buckets.set(start, bucket);
		}
		bucket.to = Math.max(bucket.to, at);
		this.dirty.add(start);
		return bucket;
	}
	private heartbeat(at: number): void {
		const earliest = Math.floor(at / MINUTE_MS) * MINUTE_MS - 10079 * MINUTE_MS;
		for (
			let start = Math.max(Math.floor(this.heartbeatAt / MINUTE_MS) * MINUTE_MS, earliest);
			start <= at;
			start += MINUTE_MS
		) {
			this.bucket(Math.min(start + MINUTE_MS - 1, at)).to = Math.min(start + MINUTE_MS, at);
		}
		this.heartbeatAt = Math.max(this.heartbeatAt, at);
		for (const start of this.buckets.keys())
			if (start < earliest) {
				this.buckets.delete(start);
				this.dirty.delete(start);
			}
	}
	private observeLatency(kind: StatsLatencyKind, ms: number): void {
		const index = CRAWLER_LATENCY_BOUNDS_MS.findIndex((bound) => ms <= bound);
		const bucket = this.bucket();
		bucket.latency[kind][index < 0 ? CRAWLER_LATENCY_BOUNDS_MS.length : index] += 1;
		bucket.latencyMaxMs[kind] = Math.max(bucket.latencyMaxMs[kind], ms);
	}
	private rangeStart(window: StatsWindow, at: number, minutes?: number): number {
		return (
			Math.floor(at / MINUTE_MS) * MINUTE_MS -
			((minutes ?? CRAWLER_WINDOW_MINUTES[window]) - 1) * MINUTE_MS
		);
	}
	getWindow(window: StatsWindow, at = this.now(), minutes?: number) {
		this.heartbeat(at);
		const start = this.rangeStart(window, at, minutes);
		const total = emptyMinute(at, at);
		for (const [time, bucket] of this.buckets)
			if (time >= start && time <= at) mergeMinute(total, bucket);
		return windowMetrics(window, total);
	}
	async getReport(window: StatsWindow, minutes?: number) {
		const at = this.now();
		this.heartbeat(at);
		const start = this.rangeStart(window, at, minutes);
		const local = [...this.buckets.entries()]
			.filter(([time]) => time >= start && time <= at)
			.map(([time, metrics]) => ({
				time,
				metrics: structuredClone(metrics),
			}));
		const persisted = this.rollup
			? await this.rollup.listRollup("crawler:minute", toInstant(new Date(start)))
			: [];
		const rows = new Map<string, StatsRollupRow>();
		for (const row of persisted)
			if (row.bucketTime.epochMilliseconds <= at)
				rows.set(`${row.sourceId}:${row.bucketTime.epochMilliseconds}`, row);
		for (const { time, metrics } of local)
			if (time >= start && time <= at)
				rows.set(`${this.sourceId}:${time}`, {
					sourceId: this.sourceId,
					bucketTime: toInstant(new Date(time)),
					metricGroup: "crawler:minute",
					metrics,
				});
		const total = emptyMinute(at, at);
		const step =
			Math.max(1, Math.ceil((minutes ?? CRAWLER_WINDOW_MINUTES[window]) / 240)) * MINUTE_MS;
		const groups = new Map<number, CrawlerMinuteMetrics>();
		for (const row of rows.values()) {
			mergeMinute(total, row.metrics);
			const time =
				start + Math.floor((row.bucketTime.epochMilliseconds - start) / step) * step;
			const group =
				groups.get(time) ??
				emptyMinute(Math.min(time + step, at), Math.min(time + step, at));
			mergeMinute(group, row.metrics);
			groups.set(time, group);
		}
		const series = [];
		for (let time = start; time <= at; time += step) {
			if (time + step <= total.from) continue;
			const group =
				groups.get(time) ??
				emptyMinute(Math.max(time, total.from), Math.min(time + step, at));
			group.from = Math.max(time, total.from);
			group.to = Math.min(time + step, at);
			series.push({
				bucketTime: new Date(time).toISOString(),
				metricGroup: "crawler:minute",
				metrics: chartMetrics(windowMetrics(window, group)),
			});
		}
		const [counts, tracking] = await Promise.all([
			this.overviewDeps.queueCounts?.() ?? Promise.resolve([]),
			this.overviewDeps.countOverdue?.(toInstant(new Date(at))) ??
				Promise.resolve({ overdueCount: 0, maxOverdueLagSec: 0 }),
		]);
		const queue = { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, inFlight: 0 };
		for (const count of counts) {
			queue.waiting += count.waiting;
			queue.active += count.active;
			queue.delayed += count.delayed;
			queue.failed += count.failed;
			queue.completed += count.completed;
		}
		queue.inFlight = queue.active + queue.waiting;
		return {
			window,
			generatedAt: new Date(at).toISOString(),
			metrics: windowMetrics(window, total),
			queue,
			tracking,
			series,
		};
	}
	async getOverviewStats(window: StatsWindow, minutes?: number) {
		return this.getReport(window, minutes);
	}

	flush(at = this.now()): Promise<number> {
		const persist = () => this.persist(at);
		const pending = this.flushing ? this.flushing.then(persist, persist) : persist();
		const result = pending.finally(() => {
			if (this.flushing === result) this.flushing = undefined;
		});
		this.flushing = result;
		return result;
	}
	private async persist(at: number): Promise<number> {
		if (!this.rollup) return 0;
		this.heartbeat(at);
		if (this.overviewDeps.queueCounts && this.overviewDeps.countOverdue) {
			try {
				const [queues, tracking] = await Promise.all([
					this.overviewDeps.queueCounts(),
					this.overviewDeps.countOverdue(toInstant(new Date(at))),
				]);
				this.bucket(at).gauges = {
					sampledAt: at,
					waiting: queues.reduce((n, q) => n + q.waiting, 0),
					active: queues.reduce((n, q) => n + q.active, 0),
					overdue: tracking.overdueCount,
				};
			} catch (error) {
				appLogger.warn("Queue and tracking gauges could not be sampled", { error });
			}
		}
		let written = 0;
		for (const time of [...this.dirty]) {
			const bucket = this.buckets.get(time);
			if (!bucket) continue;
			this.dirty.delete(time);
			try {
				await this.rollup.saveRollup({
					sourceId: this.sourceId,
					bucketTime: toInstant(new Date(time)),
					metricGroup: "crawler:minute",
					metrics: structuredClone(bucket),
				});
				written++;
			} catch (error) {
				this.dirty.add(time);
				throw error;
			}
		}
		return written;
	}
	startPeriodicFlush(intervalMs = MINUTE_MS): void {
		if (this.flushTimer || !this.rollup) return;
		this.flushTimer = setInterval(() => {
			void this.flush().catch((error) =>
				appLogger.error("Crawler metrics persistence failed", { error })
			);
		}, intervalMs);
	}
	stopPeriodicFlush(): void {
		if (this.flushTimer) clearInterval(this.flushTimer);
		this.flushTimer = undefined;
	}
}
