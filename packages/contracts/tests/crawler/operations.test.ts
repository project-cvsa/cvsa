import { describe, expect, it } from "bun:test";
import {
	CrawlerOperationsConfigDocumentSchema,
	CrawlerTaskListQuerySchema,
	CrawlerTaskPageSchema,
	CrawlerTaskStatsSchema,
	CrawlerTaskStatusSchema,
} from "../../src/crawler/operations";

const config = {
	taskPlans: {
		searchSweep: { enabled: true, intervalMs: 300_000 },
		hotDiscovery: { enabled: true, intervalMs: 300_000 },
		metadataRefresh: { enabled: true, intervalMs: 86_400_000 },
		trackingDispatch: { enabled: true, intervalMs: 1_000 },
	},
	workerCapacities: {
		tracking: { concurrency: 5, capacity: 200 },
		discovery: { concurrency: 3, capacity: 200 },
		model: { concurrency: 1, capacity: 100 },
	},
};

describe("crawler operations contracts", () => {
	it("exposes the seven task states", () => {
		for (const status of [
			"waiting",
			"running",
			"succeeded",
			"partial",
			"deferred",
			"failed",
			"cancelled",
		]) {
			expect(CrawlerTaskStatusSchema.safeParse(status).success).toBe(true);
		}
		expect(CrawlerTaskStatusSchema.safeParse("paused").success).toBe(false);
	});

	it("defaults page query values and limits page size to 100", () => {
		expect(CrawlerTaskListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
		expect(CrawlerTaskListQuerySchema.safeParse({ page: "2", pageSize: "100" }).success).toBe(
			true
		);
		expect(CrawlerTaskListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
	});

	it("validates revisions, named plans, worker capacities and paged summaries", () => {
		expect(
			CrawlerOperationsConfigDocumentSchema.safeParse({
				revision: 1,
				config,
				updatedAt: "2026-10-26T00:00:00.000Z",
			}).success
		).toBe(true);
		expect(
			CrawlerTaskPageSchema.safeParse({
				items: [
					{
						taskId: "task-1",
						taskType: "searchSweep",
						status: "succeeded",
						createdAt: "2026-10-26T00:00:00.000Z",
						startedAt: "2026-10-26T00:00:01.000Z",
						completedAt: "2026-10-26T00:00:02.000Z",
					},
				],
				total: 1,
				page: 1,
				pageSize: 20,
			}).success
		).toBe(true);
	});

	it("validates concrete rate and age statistic names", () => {
		expect(
			CrawlerTaskStatsSchema.safeParse({
				windowSeconds: 60,
				completedRequests: 20,
				requestsPerSecond: 1.2,
				requestSuccessRate: 0.95,
				snapshotSamplesPerSecond: 0.5,
				detailFetchesPerSecond: 0.2,
				classificationsPerSecond: 0.1,
				oldestDueAgeSeconds: 30,
			}).success
		).toBe(true);
		expect(
			CrawlerTaskStatsSchema.safeParse({
				windowSeconds: 60,
				completedRequests: 20,
				requestsPerSecond: 1.2,
				requestSuccessRate: 1.1,
				snapshotSamplesPerSecond: 0.5,
				detailFetchesPerSecond: 0.2,
				classificationsPerSecond: 0.1,
				oldestDueAgeSeconds: 30,
			}).success
		).toBe(false);
	});

	it("uses null success rate for an empty request window and a numeric rate for completed requests", () => {
		const idleWindow = {
			windowSeconds: 60,
			completedRequests: 0,
			requestsPerSecond: 0,
			requestSuccessRate: null,
			snapshotSamplesPerSecond: 0,
			detailFetchesPerSecond: 0,
			classificationsPerSecond: 0,
			oldestDueAgeSeconds: 0,
		};
		expect(CrawlerTaskStatsSchema.safeParse(idleWindow).success).toBe(true);
		expect(
			CrawlerTaskStatsSchema.safeParse({ ...idleWindow, requestSuccessRate: 0 }).success
		).toBe(false);
		expect(
			CrawlerTaskStatsSchema.safeParse({
				...idleWindow,
				completedRequests: 1,
				requestSuccessRate: 0,
			}).success
		).toBe(true);
		expect(
			CrawlerTaskStatsSchema.safeParse({
				...idleWindow,
				completedRequests: 1,
			}).success
		).toBe(false);
	});
});
