import { describe, expect, test } from "bun:test";
import { toInstant, type Temporal } from "@cvsa/snapshot-db";
import type { CrawlerJobCounts } from "../src/crawler/shared/types";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import type {
	SaveStatsRollupInput,
	StatsRollupRow,
	StatsRollupStore,
} from "../src/crawler/stats/rollup";
import { InMemoryTrackingRepository, createTrackingRow } from "../src/crawler/testing/fakes";

class FakeRollupStore implements StatsRollupStore {
	readonly rows: Array<{
		metricGroup: string;
		bucketTime: Temporal.Instant;
		input: SaveStatsRollupInput;
	}> = [];

	async saveRollup(input: SaveStatsRollupInput): Promise<void> {
		this.rows.push({
			metricGroup: input.metricGroup,
			bucketTime: input.bucketTime,
			input,
		});
	}

	async listRollup(
		metricGroup: string,
		since: Temporal.Instant,
		limit = 240
	): Promise<StatsRollupRow[]> {
		return this.rows
			.filter(
				(row) =>
					row.metricGroup === metricGroup &&
					row.bucketTime.epochMilliseconds >= since.epochMilliseconds
			)
			.slice(0, limit)
			.map((row) => ({
				bucketTime: row.bucketTime,
				metricGroup: row.metricGroup,
				metrics: row.input.metrics,
			}));
	}
}

/** Collector pinned to a controllable clock. */
function createCollector(start = Date.UTC(2026, 0, 1, 0, 0, 0)) {
	let now = start;
	const collector = new CrawlerStatsCollector({ now: () => now });
	return {
		collector,
		advance(ms: number) {
			now += ms;
			return now;
		},
		get now() {
			return now;
		},
	};
}

describe("CrawlerStatsCollector", () => {
	test("counts throughput per window", () => {
		const { collector } = createCollector();

		collector.recordJobCompleted();
		collector.recordJobCompleted(2);
		collector.recordSnapshotsSaved(3);
		collector.recordVideosDiscovered(2);
		collector.recordCandidatesScanned();
		collector.recordInference(20, true);
		collector.recordNetworkRequest(30, "success");
		collector.recordRetry();
		collector.recordRetry();

		const stats = collector.getWindow("5m");
		expect(stats.counters).toEqual({
			jobsCompleted: 3,
			snapshotsSaved: 3,
			videosDiscovered: 2,
			candidatesScanned: 1,
			inferencesRun: 1,
			networkRequests: 1,
		});
		expect(stats.retries).toBe(2);
	});

	test("drops events that fall out of the 5m window but keeps them in 24h", () => {
		const { collector, advance } = createCollector();

		collector.recordJobCompleted(10);
		advance(6 * 60_000);
		collector.recordJobCompleted(1);

		expect(collector.getWindow("5m").counters.jobsCompleted).toBe(1);
		expect(collector.getWindow("1h").counters.jobsCompleted).toBe(11);
		expect(collector.getWindow("24h").counters.jobsCompleted).toBe(11);

		advance(25 * 60 * 60_000);
		expect(collector.getWindow("24h").counters.jobsCompleted).toBe(0);
	});

	test("maps network outcomes onto the error taxonomy", () => {
		const { collector } = createCollector();

		collector.recordNetworkRequest(10, "timeout");
		collector.recordNetworkRequest(10, "rate_limited");
		collector.recordNetworkRequest(10, "business_error");
		collector.recordNetworkRequest(10, "http_error");
		collector.recordNetworkRequest(10, "connection_error");
		collector.recordInference(10, false);
		collector.recordError("dbError");

		const stats = collector.getWindow("5m");
		expect(stats.errors).toEqual({
			timeout: 1,
			networkFailure: 1,
			httpFailure: 1,
			networkOther: 0,
			adapterUnavailable: 0,
			rateLimited412Or429: 1,
			bilibiliBusinessError: 1,
			inferenceError: 1,
			dbError: 1,
			other: 0,
		});
		expect(stats.counters.networkRequests).toBe(5);
	});

	test("reports P95 latency as the histogram bound covering 95% of samples", () => {
		const { collector } = createCollector();

		// 99 fast tasks (<= 10ms) and one slow task (between 60s and 120s).
		for (let i = 0; i < 99; i++) collector.recordTask(8);
		collector.recordTask(90_000);

		const p95 = collector.getWindow("5m").latencyP95Ms.task;
		// 95th percentile of 100 samples is still inside the fast bucket.
		expect(p95).toBe(10);

		const { collector: skewed } = createCollector();
		for (let i = 0; i < 10; i++) skewed.recordTask(5);
		// 5% of 20 samples => the 19th sample is the slow one.
		for (let i = 0; i < 10; i++) skewed.recordTask(90_000);
		expect(skewed.getWindow("5m").latencyP95Ms.task).toBe(120_000);
	});

	test("reports zero latency for a window with no samples", () => {
		const { collector } = createCollector();
		expect(collector.getWindow("1h").latencyP95Ms).toEqual({ task: 0, api: 0, inference: 0 });
	});

	test("combines queue depth and the tracking backlog into the overview", async () => {
		const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
		const tracking = new InMemoryTrackingRepository();
		tracking.trackings.set(
			1n,
			createTrackingRow(1n, {
				nextSnapshotAt: toInstant(new Date(now.getTime() - 120_000)),
			})
		);
		// A leased video is in flight, so it must not be reported as overdue.
		tracking.trackings.set(
			2n,
			createTrackingRow(2n, {
				nextSnapshotAt: toInstant(new Date(now.getTime() - 120_000)),
				leaseUntil: toInstant(new Date(now.getTime() + 60_000)),
			})
		);

		const collector = new CrawlerStatsCollector({
			now: () => now.getTime(),
			overview: {
				async queueCounts(): Promise<CrawlerJobCounts[]> {
					return [
						{ waiting: 5, active: 2, delayed: 1, failed: 3, completed: 10 },
						{ waiting: 1, active: 1, delayed: 0, failed: 0, completed: 4 },
					];
				},
				countOverdue: (instant) => tracking.countOverdueVideos(instant),
			},
		});
		collector.recordJobCompleted(7);

		const overview = await collector.getOverviewStats("1h");
		expect(overview.window).toBe("1h");
		expect(overview.metrics.counters.jobsCompleted).toBe(7);
		expect(overview.queue).toEqual({
			waiting: 6,
			active: 3,
			delayed: 1,
			failed: 3,
			completed: 14,
			inFlight: 9,
		});
		expect(overview.tracking.overdueCount).toBe(1);
		expect(overview.tracking.maxOverdueLagSec).toBe(120);
	});

	test("survives a failing queue probe", async () => {
		const collector = new CrawlerStatsCollector({
			overview: {
				async queueCounts() {
					throw new Error("redis down");
				},
				async countOverdue() {
					throw new Error("db down");
				},
			},
		});
		const overview = await collector.getOverviewStats("5m");
		expect(overview.queue.inFlight).toBe(0);
		expect(overview.tracking).toEqual({ overdueCount: 0, maxOverdueLagSec: 0 });
	});

	test("flushes one rollup row per window, truncated to the minute", async () => {
		const store = new FakeRollupStore();
		const start = Date.UTC(2026, 0, 1, 0, 5, 37, 500);
		let now = start;
		const collector = new CrawlerStatsCollector({ now: () => now, rollup: store });

		collector.recordJobCompleted(4);
		now = start + 1_000;
		const written = await collector.flush();

		expect(written).toBe(7);
		expect(store.rows.map((row) => row.metricGroup)).toEqual([
			"crawler:5m",
			"crawler:15m",
			"crawler:30m",
			"crawler:1h",
			"crawler:6h",
			"crawler:24h",
			"crawler:7d",
		]);
		for (const row of store.rows) {
			expect(row.bucketTime.epochMilliseconds).toBe(Date.UTC(2026, 0, 1, 0, 5, 0, 0));
		}
		expect(store.rows[0]?.input.metrics.counters.jobsCompleted).toBe(4);
	});

	test("reads the historical series back", async () => {
		const store = new FakeRollupStore();
		const start = Date.UTC(2026, 0, 1, 0, 0, 0);
		let now = start;
		const collector = new CrawlerStatsCollector({ now: () => now, rollup: store });

		collector.recordSnapshotsSaved(1);
		await collector.flush();
		now = start + 60_000;
		collector.recordJobCompleted(2);
		await collector.flush();

		const history = await collector.getHistory("5m", new Date(start));
		expect(history).toHaveLength(2);
		expect(history[0]?.bucketTime).toBe(toInstant(new Date(start)).toString());
		expect(history[1]?.metrics?.counters.jobsCompleted).toBe(2);
	});
});
