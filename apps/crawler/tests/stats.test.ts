import { eq } from "drizzle-orm";
import {
	createSnapshotDb,
	crawlerStatsHourPending,
	crawlerStatsMinute,
	videoSnapshot,
} from "@cvsa/snapshot-db";
import { CrawlerStatsRepository } from "../src/crawler/stats/rollup";
import { SnapshotRepository } from "../src/crawler/snapshot/repository";
import { emptyMinute } from "../src/crawler/stats/types";
import { describe, expect, test } from "bun:test";
import { toInstant } from "@cvsa/snapshot-db";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import { InMemoryStatsStore } from "../src/crawler/testing/fakes";
import { createMemoryHeartbeatStore } from "../src/crawler/stats/heartbeat";
import { computeRatios } from "../src/crawler/stats/aggregation";
import {
	createSketch,
	deserializeDistribution,
	serializeSketch,
	summarizeSketch,
} from "../src/crawler/stats/sketch";

const START = Date.UTC(2026, 0, 1, 0, 0, 0);

function createCollector(start = START, store = new InMemoryStatsStore(), instanceId?: string) {
	let now = start;
	const collector = new CrawlerStatsCollector({
		now: () => now,
		store,
		instanceId,
	});
	return {
		collector,
		store,
		advance(ms: number) {
			now += ms;
			return now;
		},
		get now() {
			return now;
		},
	};
}

async function report(collector: CrawlerStatsCollector, window: "5m" | "1h" | "24h" = "5m") {
	await collector.flush();
	return collector.getReport(window);
}

describe("CrawlerStatsCollector", () => {
	test("includes timeout durations in the percentile chart alongside successful requests", async () => {
		const { collector, advance } = createCollector();
		for (let index = 0; index < 50; index++) {
			collector.recordHttpAttempt(10, "success");
			collector.recordHttpAttempt(1000, "timeout");
		}
		advance(60_000);
		const result = await report(collector);
		const point = result.series.find((row) => row.bucketTime === new Date(START).toISOString());
		expect(point?.metrics["latency.httpAttempt.0.9"]).toBeGreaterThan(900);
	});
	test("returns four distinct latency percentile series from each bucket distribution", async () => {
		const { collector, advance } = createCollector();
		for (let latency = 1; latency <= 100; latency++)
			collector.recordHttpAttempt(latency, "success");
		advance(60_000);
		const result = await report(collector);
		const point = result.series.find((row) => row.bucketTime === new Date(START).toISOString());
		for (const [quantile, expected] of [
			[0.5, 50],
			[0.9, 90],
			[0.95, 95],
			[0.99, 99],
		]) {
			const value = point?.metrics[`latency.httpAttempt.${quantile}`];
			expect(value).toBeGreaterThan(expected * 0.97);
			expect(value).toBeLessThan(expected * 1.03);
		}
		expect(point?.metrics["latency.modelProcess.0.95"]).toBeNull();
	});
	test("counts events and keeps started, finished and inserted counts separate", async () => {
		const { collector, advance } = createCollector();
		collector.record("videosRecorded", 3);
		collector.record("videoInsertConflicts", 2);
		collector.record("trackingCreated", 1);
		collector.record("httpAttemptsStarted");
		collector.recordHttpAttempt(30, "success");
		collector.record("candidatesStarted");
		collector.record("candidatesFinished");
		collector.recordDiscovery("search", "newTracking");
		advance(60_000);

		const result = await report(collector);
		expect(result.minutes.counters.videosRecorded).toBe(3);
		expect(result.minutes.counters.videoInsertConflicts).toBe(2);
		expect(result.minutes.counters.trackingCreated).toBe(1);
		expect(result.minutes.counters.candidatesStarted).toBe(1);
		expect(result.minutes.counters.candidatesFinished).toBe(1);
		expect(result.minutes.counters.httpAttemptsStarted).toBe(1);
		expect(result.minutes.counters.httpAttemptsFinished).toBe(1);
		expect(result.minutes.discovery.search.newTracking).toBe(1);
	});

	test("uses a left-closed, right-open range of complete minutes", async () => {
		const { collector, advance } = createCollector();
		collector.record("videosRecorded", 10);
		advance(5 * 60_000);
		collector.record("videosRecorded", 1);
		advance(60_000);

		const five = await report(collector, "5m");
		expect(five.minutes.counters.videosRecorded).toBe(1);
		expect(five.range.seconds).toBe(300);
		const fifteen = await report(collector, "1h");
		expect(fifteen.minutes.counters.videosRecorded).toBe(11);
	});

	test("maps network transport results and Bilibili business results separately", async () => {
		const { collector, advance } = createCollector();
		collector.recordHttpAttempt(10, "success");
		collector.recordHttpAttempt(10, "business_error");
		collector.recordHttpAttempt(10, "timeout");
		collector.recordHttpAttempt(10, "rate_limited");
		collector.recordHttpAttempt(10, "http_error");
		collector.recordHttpAttempt(10, "cancelled");
		advance(60_000);

		const result = await report(collector);
		expect(result.minutes.counters.httpAttemptsFinished).toBe(6);
		expect(result.minutes.counters.httpAttemptsTransportSuccess).toBe(2);
		expect(result.minutes.counters.httpAttemptsCancelled).toBe(1);
		const totals = Object.values(result.minutes.network)[0];
		expect(totals).toMatchObject({
			attempts: 6,
			transportSuccess: 2,
			transportFailure: 2,
			businessSuccess: 1,
			businessError: 1,
			rateLimited: 1,
			cancelled: 1,
			timeout: 1,
		});
		expect(computeRatios(result.minutes).httpTransportSuccess).toBe(2 / 5);
	});

	test("records one result per job execution and keeps latency in a DDSketch", async () => {
		const { collector, advance } = createCollector();
		for (let i = 0; i < 99; i++) collector.recordJobOutcome("tracking", "success", 8);
		collector.recordJobOutcome("tracking", "success", 90_000);
		collector.recordJobOutcome("tracking", "failure", 120);
		advance(60_000);

		const result = await report(collector);
		expect(result.minutes.jobs.tracking.completed).toBe(100);
		expect(result.minutes.jobs.tracking.failed).toBe(1);
		const summary = result.minutes.distributions["trackingExecution:success"];
		expect(summary?.count).toBe(100);
		expect(summary?.max).toBe(90_000);
		const latency = result.latency["trackingExecution:success"];
		expect(latency?.count).toBe(100);
		expect(latency?.quantiles["0.95"] ?? 0).toBeLessThan(10);
		expect(latency?.max).toBe(90_000);
	});

	test("merges persisted minutes from multiple instances exactly once", async () => {
		const store = new InMemoryStatsStore();
		const first = new CrawlerStatsCollector({
			now: () => START + 30_000,
			store,
			instanceId: "a",
		});
		const second = new CrawlerStatsCollector({
			now: () => START + 30_000,
			store,
			instanceId: "b",
		});
		first.record("videosRecorded", 3);
		second.record("videosRecorded", 4);
		await Promise.all([first.flush(), second.flush()]);

		const reader = new CrawlerStatsCollector({
			now: () => START + 60_000,
			store,
			instanceId: "c",
		});
		const result = await reader.getReport("5m");
		expect(result.minutes.counters.videosRecorded).toBe(7);
		expect(result.instances).toHaveLength(2);
		expect(result.coverage.status).toBe("complete");
	});

	test("marks minutes without a participating instance as missing", async () => {
		const store = new InMemoryStatsStore();
		const heartbeat = createMemoryHeartbeatStore();
		const first = new CrawlerStatsCollector({
			now: () => START + 10_000,
			store,
			heartbeat,
			instanceId: "a",
		});
		first.record("videosRecorded", 1);
		await first.flush();
		// The process is still alive, but its statistics write path stopped after
		// the first minute. The heartbeat keeps the participation window open.
		await heartbeat.write("a", START + 3 * 60_000);

		const reader = new CrawlerStatsCollector({
			now: () => START + 3 * 60_000,
			store,
			heartbeat,
			instanceId: "b",
		});
		const result = await reader.getReport("5m");
		expect(result.coverage.status).toBe("partial");
		expect(result.coverage.missingMinutes).toBeGreaterThan(0);
		expect(result.coverage.unconfirmedFrom).not.toBeNull();
	});

	test("retries failed writes without losing events recorded after the failure", async () => {
		const { collector, store, advance } = createCollector();
		collector.record("videosRecorded", 2);
		store.saveError = new Error("write failed");
		await expect(collector.flush()).rejects.toThrow("write failed");
		collector.record("videosRecorded", 3);
		store.saveError = undefined;
		advance(60_000);
		await collector.flush();
		const result = await collector.getReport("5m");
		expect(result.minutes.counters.videosRecorded).toBe(5);
		expect(result.persistence.writeFailures).toBeGreaterThan(0);
	});

	test("rolls complete minutes into an instance hour and clears the dirty marker", async () => {
		const { collector, store } = createCollector();
		collector.record("videosRecorded", 2);
		await collector.flush();
		expect(await collector.runHourlyRollup()).toBe(1);
		const hours = await store.listHours(
			toInstant(new Date(START)),
			toInstant(new Date(START + 3_600_000))
		);
		expect(hours).toHaveLength(1);
		expect(hours[0]?.metrics.counters.videosRecorded).toBe(2);
		expect(await store.listPendingHours()).toHaveLength(0);
	});

	test("recomputing one hour replaces the previous aggregate", async () => {
		const { collector, store, advance } = createCollector();
		collector.record("videosRecorded", 2);
		await collector.flush();
		await collector.runHourlyRollup();
		collector.record("videosRecorded", 3);
		advance(60_000);
		await collector.flush();
		await collector.runHourlyRollup();
		const hours = await store.listHours(
			toInstant(new Date(START)),
			toInstant(new Date(START + 3_600_000))
		);
		expect(hours[0]?.metrics.counters.videosRecorded).toBe(5);
	});

	test("restores min, max and count from a serialized DDSketch", () => {
		const sketch = createSketch();
		for (const value of [1, 2, 3, 4, 90, 1000]) sketch.accept(value);
		const restored = deserializeDistribution(serializeSketch(sketch));
		const summary = summarizeSketch(restored);
		expect(summary.count).toBe(6);
		expect(summary.min).toBe(1);
		expect(summary.max).toBe(1000);
		expect(summary.mean).toBeCloseTo(1100 / 6);
		expect(summary.quantiles["0.5"] ?? 0).toBeGreaterThanOrEqual(1);
		expect(summary.quantiles["0.5"] ?? 0).toBeLessThanOrEqual(4);
		expect(summary.quantiles["0.99"] ?? 0).toBeLessThanOrEqual(1000);
	});

	test("returns null ratios when the denominator is zero", () => {
		const ratios = computeRatios(emptyMinute(START, START + 60_000));
		expect(ratios).toEqual({
			httpTransportSuccess: null,
			logicalRequestSuccess: null,
			egressResendShare: null,
			sessionResendShare: null,
			retryRecoverySuccess: null,
			requestsPerRecord: null,
		});
	});

	test("reports an empty window as zero counts and no latency samples", async () => {
		const reader = new CrawlerStatsCollector({
			now: () => START + 10 * 60_000,
			store: new InMemoryStatsStore(),
		});
		const result = await reader.getReport("5m");
		expect(result.minutes.counters.videosRecorded).toBe(0);
		expect(result.latency).toEqual({});
		expect(result.coverage.status).toBe("none");
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
			metrics.counters.videosRecorded = 3;
			await store.saveMinute({ sourceId, bucketTime: time, metrics });
			metrics.counters.videosRecorded = 5;
			await store.saveMinute({ sourceId, bucketTime: time, metrics });
			await store.saveMinute({ sourceId: otherSourceId, bucketTime: time, metrics });
			const rows = (
				await store.listMinutes(time, toInstant(new Date(time.epochMilliseconds + 60_000)))
			).filter((row) => row.sourceId === sourceId || row.sourceId === otherSourceId);
			expect(rows).toHaveLength(2);
			expect(rows.reduce((sum, row) => sum + row.metrics.counters.videosRecorded, 0)).toBe(
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
			await db.client
				.delete(crawlerStatsHourPending)
				.where(eq(crawlerStatsHourPending.sourceId, sourceId));
			await db.client
				.delete(crawlerStatsHourPending)
				.where(eq(crawlerStatsHourPending.sourceId, otherSourceId));
			await db.client.delete(videoSnapshot).where(eq(videoSnapshot.aid, aid));
			await db.disconnect();
		}
	});

	test("records failed repository operations and preserves their errors", async () => {
		const db = createSnapshotDb();
		await db.connect();
		await db.disconnect();
		let now = Date.UTC(2026, 0, 1);
		const stats = new CrawlerStatsCollector({ now: () => now });
		const repository = new SnapshotRepository(db.client, stats);
		await expect(repository.getRecentSnapshots(1n)).rejects.toThrow();
		now += 60_000;
		const report = await stats.getReport("5m");
		expect(report.minutes.database["snapshot.getRecentSnapshots"]?.failure).toBe(1);
	});

	test("serves 24h reports from rolled hours + partial minutes while evicting old RAM buckets and preserving lifetimeCounters", async () => {
		const { collector, store, advance } = createCollector(
			START,
			new InMemoryStatsStore(),
			"inst-rollup"
		);
		// Record 2 full hours (120 minutes) + 15 partial minutes
		for (let m = 0; m < 135; m++) {
			collector.record("videosRecorded", 2);
			collector.recordHttpAttempt(20 + (m % 30), "success");
			advance(60_000);
			if (m % 30 === 29) {
				await collector.flush();
			}
		}
		await collector.flush();
		const rolled = await collector.runHourlyRollup();
		expect(rolled).toBeGreaterThanOrEqual(2);

		// Lifetime counter must remain exact even after old clean buckets were evicted from RAM
		expect(collector.lifetimeCounter("videosRecorded")).toBe(270);

		// Coalesce concurrent 24h getReport calls and verify rolled hours + fallback minutes combine without double counting
		const [r1, r2] = await Promise.all([
			collector.getReport("24h"),
			collector.getReport("24h"),
		]);
		expect(r1).toBe(r2);
		expect(r1.minutes.counters.videosRecorded).toBe(270);
		expect(r1.latency["httpAttempt:success"]?.count).toBe(135);
		expect(store.hours.size).toBeGreaterThanOrEqual(2);
	});

	test("trackingState aggregates state and priority freshness in a single GROUPING SETS pass", async () => {
		const { CrawlerStatsStateRepository } = await import(
			"../src/crawler/stats/stateRepository"
		);
		const { videoTracking } = await import("@cvsa/snapshot-db");
		const { inArray } = await import("drizzle-orm");
		const db = createSnapshotDb();
		await db.connect();
		const aid1 = 920_000_000_000_101n;
		const aid2 = 920_000_000_000_102n;
		const aid3 = 920_000_000_000_103n;
		const aids = [aid1, aid2, aid3];
		try {
			await db.client.delete(videoTracking).where(inArray(videoTracking.aid, aids));
			const nowMs = Date.now();
			await db.client.insert(videoTracking).values([
				{
					aid: aid1,
					state: "new",
					priority: 1,
					nextSnapshotAt: toInstant(new Date(nowMs - 30_000)),
					lastCapturedAt: toInstant(new Date(nowMs - 60_000)),
					nextMetadataAt: toInstant(new Date(nowMs - 10_000)),
				},
				{
					aid: aid2,
					state: "regular",
					priority: 2,
					nextSnapshotAt: toInstant(new Date(nowMs + 300_000)),
					lastCapturedAt: toInstant(new Date(nowMs - 120_000)),
				},
				{
					aid: aid3,
					state: "regular",
					priority: 2,
					nextSnapshotAt: toInstant(new Date(nowMs + 600_000)),
					lastCapturedAt: null,
				},
			]);

			const stateRepo = new CrawlerStatsStateRepository(db.client, () => nowMs);
			const summary = await stateRepo.trackingState(nowMs);
			expect(summary.total).toBeGreaterThanOrEqual(3);
			expect(summary.byState.new).toBeGreaterThanOrEqual(1);
			expect(summary.byState.regular).toBeGreaterThanOrEqual(2);
			expect(summary.byPriority["1"]).toBeGreaterThanOrEqual(1);
			expect(summary.byPriority["2"]).toBeGreaterThanOrEqual(2);
			expect(summary.neverCaptured).toBeGreaterThanOrEqual(1);
			expect(summary.dueNow).toBeGreaterThanOrEqual(1);
			expect(summary.metadataDue).toBeGreaterThanOrEqual(1);
			expect(summary.freshness.count).toBeGreaterThanOrEqual(2);
			expect(summary.freshness.quantilesSec["0.5"]).not.toBeNull();
		} finally {
			await db.client.delete(videoTracking).where(inArray(videoTracking.aid, aids));
			await db.disconnect();
		}
	});

	test("CrawlerStatsRepository.readRange uses rolled hours on 24h/7d windows and prunes expired rows", async () => {
		const { crawlerStatsHour, crawlerStatsState } = await import("@cvsa/snapshot-db");
		const db = createSnapshotDb();
		await db.connect();
		const sourceId = `test-rollup-${Date.now()}`;
		const hourStart = Date.UTC(2026, 5, 1, 10, 0, 0);
		const nextHourStart = hourStart + 3_600_000;
		try {
			const repo = new CrawlerStatsRepository(db.client);
			const m1 = emptyMinute(hourStart, hourStart + 60_000);
			m1.counters.videosRecorded = 11;
			const m2 = emptyMinute(nextHourStart, nextHourStart + 60_000);
			m2.counters.videosRecorded = 7;

			await repo.saveMinute({
				sourceId,
				bucketTime: toInstant(new Date(hourStart)),
				metrics: m1,
			});
			await repo.saveMinute({
				sourceId,
				bucketTime: toInstant(new Date(nextHourStart)),
				metrics: m2,
			});
			await repo.saveStates([
				{
					sampledAt: toInstant(new Date(hourStart + 10_000)),
					scope: "global",
					item: "queues",
					status: "success",
					data: {
						tracking: { waiting: 3, active: 1, delayed: 0, failed: 0, completed: 0 },
					},
				},
			]);

			const pending = (await repo.listPendingHours(100)).find(
				(p) => p.sourceId === sourceId && p.hourTime.epochMilliseconds === hourStart
			);
			expect(pending).toBeDefined();
			if (!pending) throw new Error("Expected pending hour marker");
			await repo.saveHour(toInstant(new Date(hourStart)), sourceId, pending.generation, m1);

			const range = await repo.readRange(
				toInstant(new Date(hourStart)),
				toInstant(new Date(nextHourStart + 1_800_000)),
				true,
				{ preferHours: true, stepMs: 900_000 }
			);
			// Clean complete hour comes from `hours`, while unrolled partial hour comes from `minutes`
			expect(
				range.hours.some(
					(h) => h.sourceId === sourceId && h.hourTime.epochMilliseconds === hourStart
				)
			).toBe(true);
			expect(
				range.minutes.some(
					(m) => m.sourceId === sourceId && m.bucketTime.epochMilliseconds === hourStart
				)
			).toBe(false);
			expect(
				range.minutes.some(
					(m) =>
						m.sourceId === sourceId && m.bucketTime.epochMilliseconds === nextHourStart
				)
			).toBe(true);
			expect(range.coveredBucketTimes).toContain(hourStart);
			expect(range.latestStates?.some((s) => s.item === "queues")).toBe(true);

			await repo.pruneBefore(toInstant(new Date(hourStart + 1)));
			expect(
				(
					await repo.listMinutes(
						toInstant(new Date(hourStart)),
						toInstant(new Date(hourStart + 60_000))
					)
				).filter((r) => r.sourceId === sourceId)
			).toHaveLength(0);
		} finally {
			await db.client
				.delete(crawlerStatsMinute)
				.where(eq(crawlerStatsMinute.sourceId, sourceId));
			await db.client.delete(crawlerStatsHour).where(eq(crawlerStatsHour.sourceId, sourceId));
			await db.client
				.delete(crawlerStatsHourPending)
				.where(eq(crawlerStatsHourPending.sourceId, sourceId));
			await db.client
				.delete(crawlerStatsState)
				.where(eq(crawlerStatsState.sampledAt, toInstant(new Date(hourStart + 10_000))));
			await db.disconnect();
		}
	});
});
