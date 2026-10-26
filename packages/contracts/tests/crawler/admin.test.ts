import { describe, expect, it } from "bun:test";
import {
	ActionQueuedResponseSchema,
	CrawlerOverviewStatsSchema,
	CrawlerStatsQuerySchema,
	DiscoverySampleListQuerySchema,
	DiscoverySampleListResponseSchema,
	LabelDiscoverySampleRequestSchema,
	TrackingVideoListQuerySchema,
	TrackingVideoListResponseSchema,
	VideoMetadataHistoryItemSchema,
	VideoMetadataHistoryListResponseSchema,
	VideoTrackingDtoSchema,
	type VideoMetadataHistoryItem,
} from "../../src/crawler";

const tracking = {
	aid: "170001",
	state: "regular",
	nextSnapshotAt: "2026-10-26T12:00:00.000Z",
	lastViews: 1_000,
	lastCapturedAt: null,
	velocity: 0,
	targetMilestone: null,
	etaHours: null,
	publishedAt: null,
	priority: 2,
	consecutiveFails: 0,
	updatedAt: "2026-10-26T12:00:00.000Z",
};

describe("crawler admin contracts", () => {
	it("matches the action-queued shape used by both control planes", () => {
		expect(ActionQueuedResponseSchema.parse({ queued: true, aid: "1" })).toEqual({
			queued: true,
			aid: "1",
		});
	});

	it("accepts the optional lease and scheduling fields on tracking rows", () => {
		const parsed = VideoTrackingDtoSchema.parse({
			...tracking,
			leaseUntil: "2026-10-26T12:00:30.000Z",
			scheduleReason: "regular",
			nextMetadataAt: null,
			lastError: "HTTP_429",
		});

		expect(parsed.leaseUntil).toBe("2026-10-26T12:00:30.000Z");
		expect(parsed.scheduleReason).toBe("regular");
		expect(parsed.lastError).toBe("HTTP_429");
	});

	it("parses metadata history items and lists", () => {
		const item = {
			id: "1",
			aid: "170001",
			capturedAt: "2026-10-26T12:00:00.000Z",
			changeType: "updated",
			changedFields: { title: { from: "a", to: "b" } },
		} satisfies VideoMetadataHistoryItem;

		expect(VideoMetadataHistoryItemSchema.safeParse(item).success).toBe(true);
		expect(
			VideoMetadataHistoryItemSchema.safeParse({ ...item, changeType: "deleted" }).success
		).toBe(false);
		expect(VideoMetadataHistoryListResponseSchema.parse({ items: [item], total: 1 })).toEqual({
			items: [item],
			total: 1,
		});
	});

	it("defaults and coerces discovery sample query params", () => {
		expect(DiscoverySampleListQuerySchema.parse({ limit: "10", offset: "5" })).toEqual({
			limit: 10,
			offset: 5,
		});
		expect(
			DiscoverySampleListQuerySchema.parse({ limit: 5, offset: 0, labeled: "false" }).labeled
		).toBe(false);
		expect(DiscoverySampleListQuerySchema.parse({}).limit).toBe(20);
	});

	it("parses discovery sample lists and label requests", () => {
		const item = {
			aid: "170001",
			bvid: "BV1xx411c7mD",
			title: "song",
			description: "",
			tags: ["vocaloid"],
			decision: "accepted",
			modelVersion: "v3",
			probabilities: { song: 0.9, other: 0.1 },
			songProbability: 0.9,
			humanLabel: null,
			labeledAt: null,
			capturedAt: "2026-10-26T12:00:00.000Z",
		};

		expect(DiscoverySampleListResponseSchema.parse({ items: [item], total: 1 }).total).toBe(1);
		expect(LabelDiscoverySampleRequestSchema.safeParse({ humanLabel: 1 }).success).toBe(true);
		expect(LabelDiscoverySampleRequestSchema.safeParse({ humanLabel: 2 }).success).toBe(false);
	});

	it("defaults tracking list pagination and accepts metadata joins", () => {
		expect(TrackingVideoListQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
		expect(
			TrackingVideoListQuerySchema.parse({ limit: "5", offset: "1", state: "new" })
		).toEqual({
			limit: 5,
			offset: 1,
			state: "new",
		});

		const parsed = TrackingVideoListResponseSchema.parse({
			items: [{ ...tracking, title: "song", bvid: "BV1xx411c7mD", ownerName: null }],
			total: 1,
		});

		expect(parsed.items[0]?.title).toBe("song");
	});

	it("defaults the stats window and validates an overview payload", () => {
		expect(CrawlerStatsQuerySchema.parse({})).toEqual({ window: "1h" });
		expect(CrawlerStatsQuerySchema.safeParse({ window: "7d" }).success).toBe(false);

		const overview = {
			window: "1h",
			jobsPerSec: 0.5,
			jobsPerMin: 30,
			snapshotsPerMin: 120,
			candidatesPerMin: 60,
			inferencesPerSec: 0.2,
			requestsPerSec: 1.5,
			totalAttempts: 100,
			totalFailures: 4,
			errorRate: 0.04,
			retryRate: 0.02,
			breakdown: {
				timeout: 1,
				rateLimited412Or429: 1,
				bilibiliBusinessError: 1,
				inferenceError: 1,
				dbError: 0,
				other: 0,
			},
			overdueTrackingCount: 3,
			maxOverdueLagSec: 42,
			queues: {
				tracking: { waiting: 1, active: 2, delayed: 0, failed: 0, oldestWaitSec: 5 },
			},
			latencyMs: { taskP95: 100, apiP95: 250, inferenceP95: 80 },
			series: [
				{
					bucketTime: "2026-10-26T12:00:00.000Z",
					metricGroup: "throughput",
					metrics: { jobsPerMin: 30 },
				},
			],
		};

		expect(CrawlerOverviewStatsSchema.parse(overview).series).toHaveLength(1);
		expect(CrawlerOverviewStatsSchema.safeParse({ ...overview, window: "24h" }).success).toBe(
			true
		);
	});
});
