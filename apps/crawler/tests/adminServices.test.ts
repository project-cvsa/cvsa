import { describe, expect, test } from "bun:test";
import type { DiscoveryJobProgress } from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import { DiscoveryAdminService } from "../src/crawler/discovery/adminService";
import { CrawlerAdminStatsService, seriesMetrics } from "../src/crawler/stats/adminService";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import type { CrawlerQueue, CrawlerQueueJobFullDetail } from "../src/crawler/shared/types";
import {
	InMemoryDiscoveryRepository,
	InMemoryTrackingRepository,
} from "../src/crawler/testing/fakes";

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
		expect(status.recentJobs[0]?.id).toBe("done");
		expect(status.candidatesPerMin).toBe(3);
		expect(status.counts.oldestWaitSec).toBeGreaterThanOrEqual(10);
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
		await service.label(1n, 1);
		expect(await tracking.getTracking(1n)).not.toBeNull();
		await service.label(1n, 0);
		expect(await tracking.getTracking(1n)).toBeNull();
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
