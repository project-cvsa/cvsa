import { eq } from "drizzle-orm";
import { createSnapshotDb, crawlerStatsMinute, videoSnapshot } from "@cvsa/snapshot-db";
import { CrawlerStatsRepository } from "../src/crawler/stats/rollup";
import { SnapshotRepository } from "../src/crawler/snapshot/repository";
import { emptyMinute } from "../src/crawler/stats/aggregation";
import type { SaveStatsRollupInput } from "../src/crawler/stats/rollup";
import { describe, expect, test } from "bun:test";
import { toInstant } from "@cvsa/snapshot-db";
import type { CrawlerJobCounts } from "../src/crawler/shared/types";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import {
	InMemoryTrackingRepository,
	createTrackingRow,
	InMemoryStatsStore,
} from "../src/crawler/testing/fakes";

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
		expect(stats.counters).toMatchObject({
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

	test("surfaces unavailable live dependencies", async () => {
		const collector = new CrawlerStatsCollector({
			overview: {
				async queueCounts() {
					throw new Error("redis down");
				},
			},
		});
		await expect(collector.getOverviewStats("5m")).rejects.toThrow("redis down");
	});

	test("repeated writes replace a process minute and reads combine persisted and live counts once", async () => {
		const store = new InMemoryStatsStore();
		let now = Date.UTC(2026, 0, 1);
		const collector = new CrawlerStatsCollector({ now: () => now, rollup: store });
		collector.recordSnapshotsSaved(4);
		now += 30_000;
		expect(await collector.flush()).toBe(1);
		collector.recordSnapshotsSaved(3);
		await collector.flush();
		const report = await collector.getReport("5m");
		expect(store.rows.size).toBe(1);
		expect(report.metrics.counters.snapshotsSaved).toBe(7);
		expect(report.series[0]?.metrics.snapshotsPerMin).toBe(14);
	});

	test("retains other processes and restart history without duplicating overlapping minutes", async () => {
		const store = new InMemoryStatsStore();
		const start = Date.UTC(2026, 0, 1);
		let now = start;
		const first = new CrawlerStatsCollector({ now: () => now, rollup: store });
		const second = new CrawlerStatsCollector({ now: () => now, rollup: store });
		first.recordSnapshotsSaved(3);
		second.recordSnapshotsSaved(4);
		now += 60_000;
		await Promise.all([first.flush(), second.flush()]);
		const restarted = new CrawlerStatsCollector({ now: () => now, rollup: store });
		restarted.recordSnapshotsSaved(5);
		now += 30_000;
		const report = await restarted.getReport("1h");
		expect(report.metrics.counters.snapshotsSaved).toBe(12);
		expect(report.metrics.from).toBe(start);
		expect(report.metrics.to).toBe(now);
		expect(report.series.map((point) => point.metrics["counters.snapshotsSaved"])).toEqual([
			7, 5,
		]);
	});

	test("retries failed persistence without losing events recorded after the failure", async () => {
		const store = new InMemoryStatsStore();
		const collector = new CrawlerStatsCollector({ rollup: store });
		collector.recordSnapshotsSaved(2);
		store.saveError = new Error("write failed");
		await expect(collector.flush()).rejects.toThrow("write failed");
		collector.recordSnapshotsSaved(3);
		store.saveError = undefined;
		await collector.flush();
		expect((await collector.getReport("5m")).metrics.counters.snapshotsSaved).toBe(5);
	});

	test("merges latency sample counts across persisted minutes before calculating P95", async () => {
		const store = new InMemoryStatsStore();
		let now = Date.UTC(2026, 0, 1);
		const collector = new CrawlerStatsCollector({ now: () => now, rollup: store });
		for (let i = 0; i < 99; i++) collector.recordTask(5);
		now += 60_000;
		await collector.flush();
		const restarted = new CrawlerStatsCollector({ now: () => now, rollup: store });
		restarted.recordTask(90_000);
		expect((await restarted.getReport("1h")).metrics.latencyP95Ms.task).toBe(5);
	});

	test("resampling keeps every event and computes each point using its own duration", async () => {
		let now = Date.UTC(2026, 0, 1);
		const collector = new CrawlerStatsCollector({ now: () => now });
		for (let i = 0; i < 300; i++) {
			collector.recordSnapshotsSaved(2);
			now += 60_000;
		}
		const report = await collector.getReport("6h");
		expect(report.series.length).toBeLessThanOrEqual(240);
		expect(
			report.series.reduce(
				(sum, point) => sum + (point.metrics["counters.snapshotsSaved"] ?? 0),
				0
			)
		).toBe(600);
		expect(report.metrics.counters.snapshotsSaved).toBe(600);
		expect(report.series[0]?.metrics.snapshotsPerMin).toBe(2);
	});

	test("uses exactly the selected minute buckets at a window boundary", () => {
		const { collector, advance } = createCollector();
		collector.recordSnapshotsSaved(10);
		advance(5 * 60_000);
		collector.recordSnapshotsSaved(1);
		expect(collector.getWindow("5m").counters.snapshotsSaved).toBe(1);
		expect(collector.getWindow("15m").counters.snapshotsSaved).toBe(11);
	});
	test("serializes overlapping flushes and saves measurements received during a write", async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		class BlockingStore extends InMemoryStatsStore {
			private block = true;
			override async saveRollup(input: SaveStatsRollupInput): Promise<void> {
				if (this.block) {
					this.block = false;
					entered.resolve();
					await release.promise;
				}
				await super.saveRollup(input);
			}
		}
		const store = new BlockingStore();
		const collector = new CrawlerStatsCollector({ rollup: store });
		collector.recordSnapshotsSaved(2);
		const first = collector.flush();
		await entered.promise;
		collector.recordSnapshotsSaved(3);
		const second = collector.flush();
		release.resolve();
		await Promise.all([first, second]);
		const restarted = new CrawlerStatsCollector({ rollup: store });
		expect((await restarted.getReport("5m")).metrics.counters.snapshotsSaved).toBe(5);
	});

	test("reports the observed maximum for latency samples beyond the histogram bounds", () => {
		const { collector } = createCollector();
		collector.recordTask(900_000);
		expect(collector.getWindow("5m").latencyP95Ms.task).toBe(900_000);
	});

	test("takes the latest queue gauge across processes instead of adding shared queue depths", async () => {
		let now = Date.UTC(2026, 0, 1);
		const store = new InMemoryStatsStore();
		let waiting = 7;
		const overview = {
			async queueCounts() {
				return [{ waiting, active: 2, delayed: 0, failed: 0, completed: 0 }];
			},
			async countOverdue() {
				return { overdueCount: 5, maxOverdueLagSec: 30 };
			},
		};
		const first = new CrawlerStatsCollector({ now: () => now, rollup: store, overview });
		await first.flush();
		now += 15_000;
		waiting = 4;
		const second = new CrawlerStatsCollector({ now: () => now, rollup: store, overview });
		await second.flush();
		const report = await first.getReport("5m");
		expect(report.series[0]?.metrics["queue.waiting"]).toBe(4);
		expect(report.series[0]?.metrics["queue.active"]).toBe(2);
	});
	test("persists counts when live queue gauges are unavailable", async () => {
		const store = new InMemoryStatsStore();
		const collector = new CrawlerStatsCollector({
			rollup: store,
			overview: {
				async queueCounts() {
					throw new Error("queue unavailable");
				},
				async countOverdue() {
					return { overdueCount: 1, maxOverdueLagSec: 5 };
				},
			},
		});
		collector.recordSnapshotsSaved(3);
		await collector.flush();
		const restarted = new CrawlerStatsCollector({ rollup: store });
		expect((await restarted.getReport("5m")).metrics.counters.snapshotsSaved).toBe(3);
	});
});

describe("crawler metrics persistence", () => {
	test("replaces one source minute, retains other sources and counts only inserted video stats", async () => {
		const db = createSnapshotDb();
		const store = new CrawlerStatsRepository(db.client);
		const sourceId = crypto.randomUUID();
		const otherSourceId = crypto.randomUUID();
		const time = toInstant(new Date(Date.UTC(2070, 0, 1)));
		const aid = BigInt(`9${Date.now()}`);
		try {
			const metrics = emptyMinute(time.epochMilliseconds, time.epochMilliseconds + 30_000);
			metrics.counters.snapshotsSaved = 3;
			await store.saveRollup({
				sourceId,
				bucketTime: time,
				metricGroup: "crawler:minute",
				metrics,
			});
			metrics.counters.snapshotsSaved = 5;
			await store.saveRollup({
				sourceId,
				bucketTime: time,
				metricGroup: "crawler:minute",
				metrics,
			});
			await store.saveRollup({
				sourceId: otherSourceId,
				bucketTime: time,
				metricGroup: "crawler:minute",
				metrics,
			});
			const rows = (await store.listRollup("crawler:minute", time)).filter(
				(row) => row.sourceId === sourceId || row.sourceId === otherSourceId
			);
			expect(rows).toHaveLength(2);
			expect(rows.reduce((sum, row) => sum + row.metrics.counters.snapshotsSaved, 0)).toBe(
				10
			);
			const snapshots = new SnapshotRepository(db.client);
			const input = {
				aid,
				capturedAt: time,
				views: 3,
				likes: 0,
				coins: 0,
				shares: 0,
				favorites: 0,
				danmakus: 0,
				replies: 0,
			};
			expect(await snapshots.createSnapshots([input])).toBe(1);
			expect(await snapshots.createSnapshots([input])).toBe(0);
		} finally {
			await db.client
				.delete(crawlerStatsMinute)
				.where(eq(crawlerStatsMinute.sourceId, sourceId));
			await db.client
				.delete(crawlerStatsMinute)
				.where(eq(crawlerStatsMinute.sourceId, otherSourceId));
			await db.client.delete(videoSnapshot).where(eq(videoSnapshot.aid, aid));
			await db.disconnect();
		}
	});
	test("records failed repository operations and preserves their errors", async () => {
		const db = createSnapshotDb();
		await db.connect();
		await db.disconnect();
		const stats = new CrawlerStatsCollector();
		const repository = new SnapshotRepository(db.client, stats);
		await expect(repository.getRecentSnapshots(1n)).rejects.toThrow();
		expect((await stats.getReport("5m")).metrics.errors.dbError).toBe(1);
	});
});
