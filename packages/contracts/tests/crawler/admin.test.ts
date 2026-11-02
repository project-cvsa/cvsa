import { describe, expect, it } from "bun:test";
import {
	ActionQueuedResponseSchema,
	CrawlerStatsQuerySchema,
	DiscoverySampleListQuerySchema,
	DiscoverySampleListResponseSchema,
	LabelDiscoverySampleRequestSchema,
	TrackingVideoListQuerySchema,
	TrackingVideoListResponseSchema,
	VideoMetadataHistoryItemSchema,
	VideoMetadataHistoryListResponseSchema,
	VideoSnapshotItemSchema,
	VideoSnapshotListQuerySchema,
	VideoSnapshotListResponseSchema,
	QueueSnapshotQuerySchema,
	VideoTrackingDtoSchema,
	type VideoMetadataHistoryItem,
	type VideoSnapshotItem,
} from "../../src/crawler";
import { CRAWLER_STATS_COUNTER_KEYS, CrawlerOverviewStatsSchema } from "../../src/crawlerStats";

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

	it("parses video snapshot items and lists", () => {
		const item: VideoSnapshotItem = {
			aid: "170001",
			capturedAt: "2026-10-26T12:00:00.000Z",
			views: 1000,
			coins: 50,
			likes: 200,
			favorites: 80,
			shares: 10,
			danmakus: 30,
			replies: 15,
		};

		expect(VideoSnapshotItemSchema.safeParse(item).success).toBe(true);
		expect(VideoSnapshotItemSchema.safeParse({ ...item, views: -1 }).success).toBe(false);
		expect(VideoSnapshotListResponseSchema.parse({ items: [item], total: 1 })).toEqual({
			items: [item],
			total: 1,
		});
		expect(VideoSnapshotListQuerySchema.parse({ limit: "15", offset: "30" })).toEqual({
			limit: 15,
			offset: 30,
		});
		expect(QueueSnapshotQuerySchema.parse({ force: "true" })).toEqual({
			force: true,
		});
	});

	it("defaults and coerces discovery sample query params", () => {
		expect(DiscoverySampleListQuerySchema.parse({ limit: "10", offset: "5" })).toMatchObject({
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
		expect(TrackingVideoListQuerySchema.parse({})).toMatchObject({ limit: 20, offset: 0 });
		expect(
			TrackingVideoListQuerySchema.parse({ limit: "5", offset: "1", state: "new" })
		).toMatchObject({
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

	it("defaults the stats window and validates a V2 overview payload", () => {
		expect(CrawlerStatsQuerySchema.parse({})).toEqual({ window: "1h" });
		expect(CrawlerStatsQuerySchema.safeParse({ window: "7d" }).success).toBe(true);
		expect(CrawlerStatsQuerySchema.safeParse({ window: "invalid" }).success).toBe(false);

		const counters = Object.fromEntries(CRAWLER_STATS_COUNTER_KEYS.map((key) => [key, 0]));
		const jobTotals = { completed: 0, failed: 0, deferred: 0, cancelled: 0, timeout: 0 };
		const overview = {
			version: 2,
			window: "1h",
			generatedAt: "2026-10-26T12:01:00.000Z",
			range: {
				from: "2026-10-26T11:00:00.000Z",
				to: "2026-10-26T12:00:00.000Z",
				seconds: 3600,
			},
			coverage: {
				status: "complete",
				from: "2026-10-26T11:00:00.000Z",
				to: "2026-10-26T12:00:00.000Z",
				minutes: 60,
				coveredMinutes: 60,
				missingMinutes: 0,
				unconfirmedFrom: null,
				legacy: false,
				enabledAt: null,
				unavailableMetrics: [],
			},
			counters,
			jobs: {
				tracking: jobTotals,
				discovery: jobTotals,
			},
			network: {},
			ratios: {
				httpTransportSuccess: null,
				logicalRequestSuccess: null,
				egressResendShare: null,
				sessionResendShare: null,
				retryRecoverySuccess: null,
				requestsPerRecord: null,
			},
			ratioInputs: {
				httpAttemptsFinished: 0,
				httpAttemptsCancelled: 0,
				httpTransportSuccess: 0,
				logicalRequests: 0,
				logicalRequestSuccess: 0,
				egressResends: 0,
				sessionResends: 0,
				retriedLogicalRequests: 0,
				retriedLogicalRequestSuccess: 0,
				videosRecorded: 0,
			},
			latency: {},
			persistence: {
				state: "ok",
				lastSuccessAt: null,
				lastHeartbeatAt: null,
				lastError: null,
				pendingMinutes: 0,
				oldestPendingAgeSec: null,
				writeSuccesses: 0,
				writeFailures: 0,
				writeDurationMs: null,
				pendingHours: 0,
				oldestPendingHourAgeSec: null,
				rollupFailures: 0,
			},
			instances: [],
			current: {
				sampledAt: null,
				stale: true,
				queues: {},
				tracking: {
					total: 0,
					byState: {},
					byPriority: {},
					neverCaptured: 0,
					freshness: { count: 0, meanSec: null, quantilesSec: {}, maxSec: null },
					freshnessByState: {},
					freshnessByPriority: {},
					dueNow: 0,
					metadataDue: 0,
					maxOverdueLagSec: 0,
				},
				model: {
					reachable: null,
					modelsLoaded: null,
					modelVersion: null,
					activeRequests: 0,
					waitingRequests: 0,
					loadFailures: 0,
					starts: 0,
					exits: 0,
					timeoutTerminations: 0,
					cancelTerminations: 0,
				},
				resources: null,
				export: {
					enabled: false,
					successes: 0,
					failures: 0,
					lastSuccessAt: null,
					durationMs: null,
					lastResult: "not_exported",
					lastError: null,
				},
				strategies: [],
			},
			discovery: { byChannel: {}, byReason: {}, byModelVersion: {} },
			labeling: {
				samples: 0,
				truePositive: 0,
				falsePositive: 0,
				trueNegative: 0,
				falseNegative: 0,
				accuracy: null,
				precision: null,
				recall: null,
			},
			videoCoverage: null,
			database: { byOperation: {}, durationMs: {} },
			redis: { byCommand: {}, durationMs: {} },
			series: [],
			legacy: null,
		};

		expect(CrawlerOverviewStatsSchema.parse(overview).version).toBe(2);
		expect(CrawlerOverviewStatsSchema.safeParse({ ...overview, version: 1 }).success).toBe(
			false
		);
	});
});
