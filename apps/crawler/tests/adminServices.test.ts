import { describe, expect, test } from "bun:test";
import type { DiscoveryJobProgress } from "@cvsa/contracts";
import { toInstant, type Temporal } from "@cvsa/snapshot-db";
import { DiscoveryAdminService } from "../src/crawler/discovery/adminService";
import { CrawlerAdminStatsService, seriesMetrics } from "../src/crawler/stats/adminService";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import type {
	SaveStatsRollupInput,
	StatsRollupRow,
	StatsRollupStore,
} from "../src/crawler/stats/rollup";
import type { CrawlerQueue, CrawlerQueueJobFullDetail } from "../src/crawler/shared/types";
import {
	createFakeMq,
	InMemoryDiscoveryRepository,
	InMemoryTrackingRepository,
} from "../src/crawler/testing/fakes";

/** Minimal rollup store so the history series can be exercised without a database. */
class InMemoryRollupStore implements StatsRollupStore {
	readonly rows: StatsRollupRow[] = [];

	async saveRollup(input: SaveStatsRollupInput): Promise<void> {
		this.rows.push({
			bucketTime: input.bucketTime,
			metricGroup: input.metricGroup,
			metrics: input.metrics,
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
			.slice(0, limit);
	}
}

function queueWith(jobs: CrawlerQueueJobFullDetail[]): CrawlerQueue<unknown> {
	return {
		async add() {},
		async getJobCounts() {
			return {
				active: jobs.filter((j) => j.state === "active").length,
				waiting: jobs.filter((j) => j.state === "waiting").length,
				delayed: jobs.filter((j) => j.state === "delayed").length,
				failed: jobs.filter((j) => j.state === "failed").length,
				completed: jobs.filter((j) => j.state === "completed").length,
			};
		},
		async getJobs(states = [], limit = 50, offset = 0) {
			return jobs
				.filter((job) => states.some((state) => state === job.state))
				.slice(offset, offset + limit);
		},
		async getJobDetail(id) {
			return jobs.find((job) => job.id === id) ?? null;
		},
		async retryJob(id) {
			const job = jobs.find((job) => job.id === id);
			if (!job) return false;
			job.state = "waiting";
			return true;
		},
		async removeJob(id) {
			const index = jobs.findIndex((job) => job.id === id);
			if (index < 0) return false;
			jobs.splice(index, 1);
			return true;
		},
		async close() {},
	};
}
function job(id: string, state = "waiting"): CrawlerQueueJobFullDetail {
	return {
		id,
		state,
		name: `job-${id}`,
		timestamp: Date.now() - 10000,
		attempts: 1,
		data: { aid: id },
		opts: { attempts: 3 },
		returnvalue: { saved: true },
		stacktrace: ["example stack"],
	};
}

describe("crawler admin services", () => {
	test("counts and pages across queues and states without capping the reported total", async () => {
		const tracking = queueWith(Array.from({ length: 130 }, (_, index) => job(String(index))));
		const discovery = queueWith([job("failed-discovery", "failed"), job("done", "completed")]);
		const service = new CrawlerAdminStatsService(
			{ tracking, discovery },
			new CrawlerStatsCollector()
		);
		const page = await service.jobs({ limit: 5, offset: 128 });
		expect(page.total).toBe(132);
		expect(page.items.map((item) => item.id)).toEqual([
			"128",
			"129",
			"failed-discovery",
			"done",
		]);
		expect((await service.jobs({ limit: 5, state: "failed" })).items[0]?.queue).toBe(
			"discovery"
		);
	});
	test("preserves detail data and restricts retry and removal to valid states", async () => {
		const tracking = queueWith([job("active", "active"), job("failed", "failed")]);
		const service = new CrawlerAdminStatsService(
			{ tracking, discovery: queueWith([]) },
			new CrawlerStatsCollector()
		);
		expect((await service.detail("tracking", "failed")).returnvalue).toEqual({ saved: true });
		await expect(service.retry("tracking", "active")).rejects.toMatchObject({
			statusCode: 409,
		});
		await expect(service.remove("tracking", "active")).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(await service.retry("tracking", "failed")).toEqual({ ok: true });
		expect((await service.detail("tracking", "failed")).state).toBe("waiting");
		await service.remove("tracking", "failed");
		await expect(service.detail("tracking", "failed")).rejects.toMatchObject({
			statusCode: 404,
		});
	});
	test("discovery shows actual progress and excludes waiting jobs from the active list", async () => {
		const progress: DiscoveryJobProgress = {
			stage: "searching",
			target: "洛天依",
			order: "pubdate",
			page: 2,
			candidates: 18,
			queued: 3,
			updatedAt: new Date().toISOString(),
		};
		const queue = queueWith([
			{ ...job("active", "active"), progress },
			job("waiting"),
			job("done", "completed"),
		]);
		const stats = new CrawlerStatsCollector();
		stats.recordCandidatesScanned(15);
		const service = new DiscoveryAdminService(
			queue,
			new InMemoryDiscoveryRepository(),
			stats,
			new InMemoryTrackingRepository()
		);
		const status = await service.getStatus();
		expect(status.activeJobs.map((item) => item.id)).toEqual(["active"]);
		expect(status.activeJobs[0]?.progress?.page).toBe(2);
		expect(status.activeJobs[0]?.progress?.queued).toBe(3);
		expect(status.activeJobs[0]?.target).toBe("洛天依");
		expect(status.recentJobs[0]?.id).toBe("done");
		expect(status.recentJobs[0]?.progress).toBeNull();
		expect(status.active).toBe(true);
		expect(status.counts).toMatchObject({ waiting: 1, active: 1, delayed: 0, failed: 0 });
		expect(status.candidatesPerMin).toBe(3);
		expect(status.counts.oldestWaitSec).toBeGreaterThanOrEqual(10);
	});
	test("ignores malformed job progress instead of failing the status query", async () => {
		const queue = queueWith([
			{ ...job("active", "active"), progress: { stage: "bogus", candidates: -1 } },
		]);
		const service = new DiscoveryAdminService(
			queue,
			new InMemoryDiscoveryRepository(),
			new CrawlerStatsCollector(),
			new InMemoryTrackingRepository()
		);
		const status = await service.getStatus();
		expect(status.activeJobs).toHaveLength(1);
		expect(status.activeJobs[0]?.progress).toBeNull();
		// Without a valid progress document the target falls back to the job data.
		expect(status.activeJobs[0]?.target).toBe("active");
	});
	test("queries candidates beyond the first 200 rows and returns the full matching total", async () => {
		const repository = new InMemoryDiscoveryRepository();
		for (let index = 1; index <= 230; index++)
			await repository.upsertSample({
				aid: BigInt(index),
				bvid: `BV${index}`,
				title: `candidate-${index}`,
				decision: "model_rejected",
				modelVersion: "test",
				probabilities: [],
				songProbability: index / 230,
				createdAt: toInstant(new Date(index * 1000)),
			});
		const service = new DiscoveryAdminService(
			queueWith([]),
			repository,
			new CrawlerStatsCollector(),
			new InMemoryTrackingRepository()
		);
		const page = await service.listSamples({
			limit: 10,
			offset: 210,
			sortBy: "confidence",
			sortOrder: "asc",
			decision: "model_rejected",
		});
		expect(page.total).toBe(230);
		expect(page.items[0]?.aid).toBe("211");
		const search = await service.listSamples({
			limit: 10,
			offset: 0,
			search: "candidate-1",
			maxConfidence: 0.1,
		});
		expect(search.total).toBe(11);
	});
	test("manual acceptance promotes a rejected candidate; rejection removes it from tracking", async () => {
		const repository = new InMemoryDiscoveryRepository();
		const tracking = new InMemoryTrackingRepository();
		await repository.upsertSample({
			aid: 1n,
			bvid: "BV1",
			title: "candidate",
			decision: "model_rejected",
			modelVersion: "test",
			probabilities: [],
			songProbability: 0.1,
		});
		const service = new DiscoveryAdminService(
			queueWith([]),
			repository,
			new CrawlerStatsCollector(),
			tracking
		);
		const accepted = await service.label(1n, 1);
		expect(accepted.humanLabel).toBe(1);
		expect(accepted.labeledAt).not.toBeNull();
		expect(await tracking.getTracking(1n)).toMatchObject({
			state: "new",
			scheduleReason: "initial",
		});
		const rejected = await service.label(1n, 0);
		expect(rejected.humanLabel).toBe(0);
		expect(rejected.labeledAt).not.toBeNull();
		expect(await tracking.getTracking(1n)).toBeNull();
		await expect(service.label(999n, 1)).rejects.toMatchObject({ statusCode: 404 });
	});
	test("scales custom-range series rates by the requested minutes, not the preset window", async () => {
		const now = Date.now();
		const store = new InMemoryRollupStore();
		const collector = new CrawlerStatsCollector({ now: () => now, rollup: store });
		collector.recordSnapshotsSaved(90);
		for (let index = 0; index < 540; index++) collector.recordNetworkRequest();
		for (let index = 0; index < 54; index++) collector.recordError("timeout");
		await collector.flush();

		const service = new CrawlerAdminStatsService(
			{ tracking: queueWith([]), discovery: queueWith([]) },
			collector
		);

		const custom = await service.overview({ window: "1h", minutes: 90 });
		expect(custom.minutes).toBe(90);
		expect(custom.series).toHaveLength(1);
		const customPoint = custom.series[0]?.metrics;
		// 90 minutes = 5400 seconds: 90 snapshots in 90 minutes, 540 requests in 90m.
		expect(customPoint?.snapshotsPerMin).toBe(1);
		expect(customPoint?.requestsPerSec).toBeCloseTo(0.1);
		expect(customPoint?.errorPercent).toBe(10);

		const preset = await service.overview({ window: "1h" });
		expect(preset.minutes).toBeUndefined();
		expect(preset.series[0]?.metrics.snapshotsPerMin).toBe(1.5);
		expect(preset.series[0]?.metrics.requestsPerSec).toBeCloseTo(0.15);
	});
	test("pages jobs across queue boundaries with the requested limit", async () => {
		const tracking = queueWith([job("t0", "active"), job("t1", "active"), job("t2", "active")]);
		const discovery = queueWith([
			job("d0", "active"),
			job("d1", "active"),
			job("d2", "active"),
			job("d3", "active"),
		]);
		const service = new CrawlerAdminStatsService(
			{ tracking, discovery },
			new CrawlerStatsCollector()
		);

		const first = await service.jobs({ queue: "all", state: "active", limit: 4, offset: 2 });
		expect(first.total).toBe(7);
		expect(first.items.map((item) => item.id)).toEqual(["t2", "d0", "d1", "d2"]);

		const tail = await service.jobs({ queue: "all", state: "active", limit: 4, offset: 6 });
		expect(tail.items.map((item) => item.id)).toEqual(["d3"]);

		const overflow = await service.jobs({ queue: "all", state: "active", limit: 4, offset: 7 });
		expect(overflow.items).toEqual([]);
		expect(overflow.total).toBe(7);
	});
	test("applies the offset across state boundaries and keeps per-state totals intact", async () => {
		const tracking = queueWith([
			job("w0"),
			job("w1"),
			job("w2"),
			job("f0", "failed"),
			job("f1", "failed"),
		]);
		const discovery = queueWith([job("w3"), job("f2", "failed")]);
		const service = new CrawlerAdminStatsService(
			{ tracking, discovery },
			new CrawlerStatsCollector()
		);

		// Flattened order: waiting w0,w1,w2,w3 then failed f0,f1,f2.
		const page = await service.jobs({ limit: 3, offset: 2 });
		expect(page.total).toBe(7);
		expect(page.items.map((item) => item.id)).toEqual(["w2", "w3", "f0"]);
	});
	test("keeps the full total when a page is smaller than a state's depth", async () => {
		const tracking = queueWith(Array.from({ length: 130 }, (_, index) => job(String(index))));
		const service = new CrawlerAdminStatsService(
			{ tracking, discovery: queueWith([]) },
			new CrawlerStatsCollector()
		);

		const page = await service.jobs({ limit: 5, offset: 0 });
		expect(page.total).toBe(130);
		expect(page.items.map((item) => item.id)).toEqual(["0", "1", "2", "3", "4"]);
		expect(page.items.every((item) => item.queue === "tracking")).toBe(true);

		const middle = await service.jobs({ limit: 5, offset: 126 });
		expect(middle.items.map((item) => item.id)).toEqual(["126", "127", "128", "129"]);
	});
	test("state=all includes completed jobs and counts every queue and state", async () => {
		const tracking = queueWith([
			job("w0"),
			job("w1"),
			job("f0", "failed"),
			job("c0", "completed"),
		]);
		const discovery = queueWith([job("w2"), job("c1", "completed")]);
		const service = new CrawlerAdminStatsService(
			{ tracking, discovery },
			new CrawlerStatsCollector()
		);

		const page = await service.jobs({ limit: 100 });
		expect(page.total).toBe(6);
		// States are flattened in contract order, then queues in tracking/discovery order.
		expect(page.items.map((item) => `${item.queue}:${item.id}:${item.state}`)).toEqual([
			"tracking:w0:waiting",
			"tracking:w1:waiting",
			"discovery:w2:waiting",
			"tracking:f0:failed",
			"tracking:c0:completed",
			"discovery:c1:completed",
		]);
		expect(page.items.filter((item) => item.state === "completed")).toHaveLength(2);
	});
	test("fake queue pages jobs, scopes ids per queue and round-trips job detail", async () => {
		const mq = createFakeMq();
		const tracking = mq.createQueue<{ aid: string }>("snapshot-batch");
		const discovery = mq.createQueue<{ aid: string }>("crawler-discovery");
		await tracking.add("process-batch", { aid: "1" });
		await tracking.add("process-batch", { aid: "2" });
		await discovery.add("detail-3", { aid: "3" });
		await tracking.add("late", { aid: "4" }, { delay: 1_000 });

		expect((await tracking.getJobs(undefined, 1, 0)).map((item) => item.id)).toEqual(["1"]);
		expect((await tracking.getJobs(undefined, 1, 1)).map((item) => item.id)).toEqual(["2"]);
		expect(await tracking.getJobs(undefined, 0, 0)).toEqual([]);
		// Job ids are queue scoped, exactly like BullMQ.
		expect((await discovery.getJobs()).map((item) => item.id)).toEqual(["1"]);

		const detail = await tracking.getJobDetail("2");
		expect(detail).toMatchObject({
			id: "2",
			name: "process-batch",
			data: { aid: "2" },
			state: "waiting",
			attempts: 0,
		});
		expect(detail?.stacktrace).toBeNull();

		expect(await tracking.getJobCounts()).toEqual({
			waiting: 2,
			active: 0,
			delayed: 1,
			failed: 0,
			completed: 0,
		});
		expect(await discovery.getJobCounts()).toEqual({
			waiting: 1,
			active: 0,
			delayed: 0,
			failed: 0,
			completed: 0,
		});

		const failedJob = mq.state.queuedJobs[0];
		if (!failedJob) throw new Error("expected a queued job");
		failedJob.state = "failed";
		failedJob.failedReason = "boom";
		expect(await tracking.retryJob("1")).toBe(true);
		expect(await tracking.getJobDetail("1")).toMatchObject({
			state: "waiting",
			failedReason: null,
		});
		expect(await tracking.getJobDetail("99")).toBeNull();
		expect(await tracking.retryJob("99")).toBe(false);

		expect(await tracking.removeJob("2")).toBe(true);
		expect(await tracking.removeJob("2")).toBe(false);
		expect(await tracking.getJobDetail("2")).toBeNull();
		expect((await tracking.getJobCounts()).waiting).toBe(1);
	});
	test("converts rolling counters into rates using their actual duration", () => {
		const metrics = seriesMetrics(
			{
				"counters.snapshotsSaved": 120,
				"counters.networkRequests": 600,
				"errors.timeout": 30,
				"errors.inferenceError": 90,
				retries: 60,
				"latencyP95Ms.api": 200,
				"queue.waiting": 18,
			},
			3600
		);
		expect(metrics.snapshotsPerMin).toBe(2);
		expect(metrics.requestsPerSec).toBeCloseTo(1 / 6);
		expect(metrics.errorPercent).toBe(5);
		expect(metrics.retryPercent).toBe(10);
		expect(metrics["latencyP95Ms.api"]).toBe(200);
		expect(metrics["queue.waiting"]).toBe(18);
	});
});
