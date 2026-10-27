import { z } from "zod";

export const VideoTrackingDtoSchema = z.object({
	aid: z.string(),
	state: z.string(),
	nextSnapshotAt: z.string(),
	lastViews: z.number().int(),
	lastCapturedAt: z.string().nullable(),
	velocity: z.number(),
	targetMilestone: z.number().int().nullable(),
	etaHours: z.number().nullable(),
	publishedAt: z.string().nullable(),
	priority: z.number().int(),
	consecutiveFails: z.number().int(),
	updatedAt: z.string(),
	/** Worker lease deadline; `null` when the row is not currently leased. */
	leaseUntil: z.string().nullable().optional(),
	/** Why the row is due now (e.g. `regular`, `milestone`, `manual`). */
	scheduleReason: z.string().optional(),
	/** Next scheduled metadata refresh, when one is pending. */
	nextMetadataAt: z.string().nullable().optional(),
	/** Most recent failure summary, cleared after a successful refresh. */
	lastError: z.string().nullable().optional(),
});

export const RegisterTrackingVideosRequestSchema = z.object({
	aids: z
		.array(z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]))
		.min(1)
		.max(1000),
	state: z.enum(["new", "regular", "milestone", "archive"]).optional(),
	priority: z.number().int().min(1).max(5).optional(),
});

export const RegisterTrackingVideosResponseSchema = z.object({
	registered: z.number().int().nonnegative(),
});

export const PromoteTrackingVideoRequestSchema = z.object({
	targetMilestone: z.number().int().positive().optional(),
	priority: z.number().int().min(1).max(5).optional(),
});

export const DiscoverySweepRequestSchema = z.object({
	keywords: z.array(z.string().min(1)).min(1).max(50).optional(),
	orders: z
		.array(z.enum(["totalrank", "click", "pubdate", "dm", "stow"]))
		.min(1)
		.max(5)
		.optional(),
	pagesPerQuery: z.number().int().min(1).max(10).optional(),
	categoryId: z.number().int().positive().optional(),
});

export const DiscoverySweepResponseSchema = z.object({
	totalDiscovered: z.number().int().nonnegative(),
	newTracked: z.number().int().nonnegative(),
});

export const ProcessRecommendationsResponseSchema = z.object({
	sourceAid: z.string(),
	relationsCount: z.number().int().nonnegative(),
	newTracked: z.number().int().nonnegative(),
});

export const BilibiliVideoMetadataDtoSchema = z.object({
	aid: z.string(),
	bvid: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	pic: z.string().nullable(),
	pubdate: z.string().nullable(),
	duration: z.number().int(),
	mid: z.string().nullable(),
	ownerName: z.string().nullable(),
	ownerFace: z.string().nullable(),
	tid: z.number().int().nullable(),
	tname: z.string().nullable(),
	copyright: z.number().int().nullable(),
	/** First-page CID, as a decimal string (BigInt on the wire). */
	cid: z.string().nullable().optional(),
	/** Number of parts on a multi-part video. */
	videos: z.number().int().optional(),
	tidV2: z.number().int().nullable().optional(),
	tnameV2: z.string().nullable().optional(),
	/** Creation time, ISO-8601. */
	ctime: z.string().nullable().optional(),
	/** Structured description blocks (`desc_v2`). */
	descV2: z.unknown().nullable().optional(),
	state: z.number().int().optional(),
	/** Bilibili's `dynamic` blurb. */
	dynamic: z.string().nullable().optional(),
	dimension: z.unknown().nullable().optional(),
	pages: z.unknown().nullable().optional(),
	staff: z.unknown().nullable().optional(),
	rights: z.unknown().nullable().optional(),
	honorReply: z.unknown().nullable().optional(),
	tags: z.unknown().nullable(),
	videoStatus: z.string().optional(),
	filterDecision: z.string().optional(),
	modelScore: z.number().nullable().optional(),
	modelVersion: z.string().nullable().optional(),
	discoverySource: z.string().nullable().optional(),
	capturedAt: z.string(),
	updatedAt: z.string(),
});

export const BilibiliVideoRelationDtoSchema = z.object({
	sourceAid: z.string(),
	targetAid: z.string(),
	position: z.number().int().nonnegative(),
	capturedAt: z.string(),
});

export const DiscoveryFilterConfigDtoSchema = z.object({
	whitelistSingers: z.array(z.string()),
	whitelistSongIndicators: z.array(z.string()),
	blacklistKeywords: z.array(z.string()),
	minDurationSeconds: z.number().int().positive(),
	maxDurationSeconds: z.number().int().positive(),
	rejectionSampleRate: z.number().min(0).max(1),
	/** Run the in-process ONNX classifier for candidates the rules cannot settle. */
	modelEnabled: z.boolean(),
	/** Minimum `1 - P(not a song)` required to accept. */
	modelThreshold: z.number().min(0).max(1),
});

export const ClassifierHealthDtoSchema = z.object({
	reachable: z.boolean(),
	modelsLoaded: z.boolean().nullable(),
});

export const UpdateDiscoveryFilterConfigRequestSchema = z.object({
	whitelistSingers: z.array(z.string()).optional(),
	whitelistSongIndicators: z.array(z.string()).optional(),
	blacklistKeywords: z.array(z.string()).optional(),
	minDurationSeconds: z.number().int().positive().optional(),
	maxDurationSeconds: z.number().int().positive().optional(),
	rejectionSampleRate: z.number().min(0).max(1).optional(),
	modelEnabled: z.boolean().optional(),
	modelThreshold: z.number().min(0).max(1).optional(),
});

export const CrawlerStatusDtoSchema = z.object({
	ready: z.boolean(),
	revision: z.number().nullable(),
	adapters: z.array(
		z.object({
			id: z.string(),
			enabled: z.boolean(),
			healthState: z.string(),
			healthFactor: z.number(),
			effectiveWeight: z.number(),
			consecutiveFailures: z.number(),
			openUntil: z.number().nullable(),
		})
	),
});

export const AdapterIdSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-zA-Z0-9_-]+$/);

export const NetworkRateLimitSchema = z.object({
	durationSeconds: z.number().int().positive().max(3_600),
	maxRequests: z.number().int().positive().max(1_000_000),
});

export const DirectAdapterConfigSchema = z.object({
	type: z.literal("direct"),
	id: AdapterIdSchema,
	enabled: z.boolean().default(true),
	baseWeight: z.number().positive().default(1),
	rateLimits: z.array(NetworkRateLimitSchema).default([]),
});

export const HttpProxyAdapterConfigSchema = z.object({
	type: z.literal("http-proxy"),
	id: AdapterIdSchema,
	enabled: z.boolean().default(true),
	baseWeight: z.number().positive().default(1),
	rateLimits: z.array(NetworkRateLimitSchema).default([]),
	proxyUrl: z.string().min(1),
});

export const NetworkAdapterConfigSchema = z.discriminatedUnion("type", [
	DirectAdapterConfigSchema,
	HttpProxyAdapterConfigSchema,
]);

export const RequestAdapterBindingSchema = z.object({
	requestType: z.string().min(1).max(128),
	adapterIds: z.array(AdapterIdSchema).min(1),
});

export const SoftReservePolicySchema = z.object({
	reservedShare: z.number().min(0).max(1),
});

export const HealthConfigSchema = z.object({
	failurePenalty: z.number().gt(0).lt(1).default(0.5),
	recoveryBonus: z.number().gt(0).lt(1).default(0.2),
	minWeightFactor: z.number().gte(0).lt(1).default(0.05),
	failureThreshold: z.number().int().positive().max(100).default(3),
	cooldownMs: z.number().int().positive().max(3_600_000).default(30_000),
});

export const NetworkRuntimeConfigSchema = z.object({
	adapters: z.array(NetworkAdapterConfigSchema),
	bindings: z.array(RequestAdapterBindingSchema).optional(),
	requestTypePolicies: z.record(z.string(), SoftReservePolicySchema).optional().default({}),
	health: HealthConfigSchema.optional(),
});

export const NetworkRuntimeConfigDocumentSchema = z.object({
	revision: z.number().int().positive(),
	config: NetworkRuntimeConfigSchema,
	updatedAt: z.union([z.string(), z.date()]),
});

export const ReplaceNetworkRuntimeConfigRequestSchema = z.object({
	revision: z.number().int().nonnegative(),
	config: NetworkRuntimeConfigSchema,
});

export type NetworkRateLimit = z.infer<typeof NetworkRateLimitSchema>;
export type DirectAdapterConfig = z.infer<typeof DirectAdapterConfigSchema>;
export type HttpProxyAdapterConfig = z.infer<typeof HttpProxyAdapterConfigSchema>;
export type NetworkAdapterConfig = z.infer<typeof NetworkAdapterConfigSchema>;
export type RequestAdapterBinding = z.infer<typeof RequestAdapterBindingSchema>;
export type SoftReservePolicy = z.infer<typeof SoftReservePolicySchema>;
export type HealthConfig = z.infer<typeof HealthConfigSchema>;
export type NetworkRuntimeConfig = z.infer<typeof NetworkRuntimeConfigSchema>;
export type NetworkRuntimeConfigDocument = z.infer<typeof NetworkRuntimeConfigDocumentSchema>;
export type ReplaceNetworkRuntimeConfigRequest = z.infer<
	typeof ReplaceNetworkRuntimeConfigRequestSchema
>;
export type VideoTrackingDto = z.infer<typeof VideoTrackingDtoSchema>;
export type RegisterTrackingVideosRequest = z.infer<typeof RegisterTrackingVideosRequestSchema>;
export type RegisterTrackingVideosResponse = z.infer<typeof RegisterTrackingVideosResponseSchema>;
export type PromoteTrackingVideoRequest = z.infer<typeof PromoteTrackingVideoRequestSchema>;
export type DiscoverySweepRequest = z.infer<typeof DiscoverySweepRequestSchema>;
export type DiscoverySweepResponse = z.infer<typeof DiscoverySweepResponseSchema>;
export type ProcessRecommendationsResponse = z.infer<typeof ProcessRecommendationsResponseSchema>;
export type BilibiliVideoMetadataDto = z.infer<typeof BilibiliVideoMetadataDtoSchema>;
export type BilibiliVideoRelationDto = z.infer<typeof BilibiliVideoRelationDtoSchema>;
export type DiscoveryFilterConfigDto = z.infer<typeof DiscoveryFilterConfigDtoSchema>;
export type UpdateDiscoveryFilterConfigRequest = z.infer<
	typeof UpdateDiscoveryFilterConfigRequestSchema
>;
export type CrawlerStatusDto = z.infer<typeof CrawlerStatusDtoSchema>;
export type ClassifierHealthDto = z.infer<typeof ClassifierHealthDtoSchema>;

// Admin actions

/** Returned by control-plane actions that enqueue background work for a video. */
export const ActionQueuedResponseSchema = z.object({
	queued: z.boolean(),
	aid: z.string(),
});

// Metadata history

/** One stored metadata change for a tracked video. */
export const VideoMetadataHistoryItemSchema = z.object({
	id: z.string(),
	aid: z.string(),
	capturedAt: z.string(),
	changeType: z.enum(["created", "updated", "status_changed"]),
	/** Field name -> previous/next values for the fields that changed. */
	changedFields: z.record(z.string(), z.unknown()),
});

export const VideoMetadataHistoryListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export const VideoMetadataHistoryListResponseSchema = z.object({
	items: z.array(VideoMetadataHistoryItemSchema),
	total: z.number().int().nonnegative(),
});

// Discovery samples (classifier training data)

/** A stored discovery decision together with its optional human label. */
export const DiscoverySampleItemSchema = z.object({
	aid: z.string(),
	bvid: z.string(),
	title: z.string(),
	description: z.string(),
	tags: z.array(z.string()),
	decision: z.string(),
	modelVersion: z.string(),
	/** Classifier label -> probability. */
	probabilities: z.record(z.string(), z.number()),
	songProbability: z.number().min(0).max(1),
	/** `0` = rejected, `1` = accepted, `null` = not labelled yet. */
	humanLabel: z.number().int().nullable(),
	labeledAt: z.string().nullable(),
	capturedAt: z.string(),
});

/** Boolean query params arrive as strings, so accept both encodings. */
const QueryBooleanSchema = z
	.union([z.boolean(), z.enum(["true", "false"])])
	.transform((value) => value === true || value === "true");

export const DiscoverySampleListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	decision: z.string().min(1).optional(),
	labeled: QueryBooleanSchema.optional(),
});

export const DiscoverySampleListResponseSchema = z.object({
	items: z.array(DiscoverySampleItemSchema),
	total: z.number().int().nonnegative(),
});

export const LabelDiscoverySampleRequestSchema = z.object({
	humanLabel: z.union([z.literal(0), z.literal(1)]),
});

// Tracking videos list

/** A tracking row joined with the metadata fields the admin UI displays. */
export const TrackingVideoListItemSchema = VideoTrackingDtoSchema.extend({
	title: z.string().optional(),
	bvid: z.string().optional(),
	ownerName: z.string().nullable().optional(),
	videoStatus: z.string().optional(),
	filterDecision: z.string().optional(),
	discoverySource: z.string().nullable().optional(),
});

export const TrackingVideoListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	state: z.string().min(1).optional(),
	search: z.string().min(1).optional(),
});

export const TrackingVideoListResponseSchema = z.object({
	items: z.array(TrackingVideoListItemSchema),
	total: z.number().int().nonnegative(),
});

// Stats & rollups

export const CrawlerStatsWindowSchema = z.enum(["5m", "1h", "24h"]);

export const CrawlerStatsQuerySchema = z.object({
	window: CrawlerStatsWindowSchema.default("1h"),
});

/** A single persisted rollup bucket for one metric group. */
export const CrawlerStatsRollupPointSchema = z.object({
	bucketTime: z.string(),
	metricGroup: z.string(),
	metrics: z.record(z.string(), z.number()),
});

export const CrawlerStatsErrorBreakdownSchema = z.object({
	timeout: z.number().int().nonnegative(),
	rateLimited412Or429: z.number().int().nonnegative(),
	bilibiliBusinessError: z.number().int().nonnegative(),
	inferenceError: z.number().int().nonnegative(),
	dbError: z.number().int().nonnegative(),
	other: z.number().int().nonnegative(),
});

export const CrawlerQueueSnapshotSchema = z.object({
	waiting: z.number().int().nonnegative(),
	active: z.number().int().nonnegative(),
	delayed: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	oldestWaitSec: z.number().nonnegative(),
});

export const CrawlerLatencyStatsSchema = z.object({
	taskP95: z.number().nonnegative(),
	apiP95: z.number().nonnegative(),
	inferenceP95: z.number().nonnegative(),
});

export const CrawlerOverviewStatsSchema = z.object({
	window: CrawlerStatsWindowSchema,
	// Throughput
	jobsPerSec: z.number().nonnegative(),
	jobsPerMin: z.number().nonnegative(),
	snapshotsPerMin: z.number().nonnegative(),
	candidatesPerMin: z.number().nonnegative(),
	inferencesPerSec: z.number().nonnegative(),
	requestsPerSec: z.number().nonnegative(),
	// Errors
	totalAttempts: z.number().int().nonnegative(),
	totalFailures: z.number().int().nonnegative(),
	/** Failure fraction for the window (`failures / attempts`). */
	errorRate: z.number().min(0),
	/** Retried-attempt fraction for the window. */
	retryRate: z.number().min(0),
	breakdown: CrawlerStatsErrorBreakdownSchema,
	// Backlog & latency
	overdueTrackingCount: z.number().int().nonnegative(),
	maxOverdueLagSec: z.number().nonnegative(),
	/** Queue name (e.g. `tracking`, `discovery`) -> counters. */
	queues: z.record(z.string(), CrawlerQueueSnapshotSchema),
	latencyMs: CrawlerLatencyStatsSchema,
	// Time series
	series: z.array(CrawlerStatsRollupPointSchema),
});

export type ActionQueuedResponse = z.infer<typeof ActionQueuedResponseSchema>;
export type VideoMetadataHistoryItem = z.infer<typeof VideoMetadataHistoryItemSchema>;
export type VideoMetadataHistoryListQuery = z.infer<typeof VideoMetadataHistoryListQuerySchema>;
export type VideoMetadataHistoryListResponse = z.infer<
	typeof VideoMetadataHistoryListResponseSchema
>;
export type DiscoverySampleItem = z.infer<typeof DiscoverySampleItemSchema>;
export type DiscoverySampleListQuery = z.infer<typeof DiscoverySampleListQuerySchema>;
export type DiscoverySampleListResponse = z.infer<typeof DiscoverySampleListResponseSchema>;
export type LabelDiscoverySampleRequest = z.infer<typeof LabelDiscoverySampleRequestSchema>;
export type TrackingVideoListItem = z.infer<typeof TrackingVideoListItemSchema>;
export type TrackingVideoListQuery = z.infer<typeof TrackingVideoListQuerySchema>;
export type TrackingVideoListResponse = z.infer<typeof TrackingVideoListResponseSchema>;
export type CrawlerStatsWindow = z.infer<typeof CrawlerStatsWindowSchema>;
export type CrawlerStatsQuery = z.infer<typeof CrawlerStatsQuerySchema>;
export type CrawlerStatsRollupPoint = z.infer<typeof CrawlerStatsRollupPointSchema>;
export type CrawlerStatsErrorBreakdown = z.infer<typeof CrawlerStatsErrorBreakdownSchema>;
export type CrawlerQueueSnapshot = z.infer<typeof CrawlerQueueSnapshotSchema>;
export type CrawlerLatencyStats = z.infer<typeof CrawlerLatencyStatsSchema>;
export type CrawlerOverviewStats = z.infer<typeof CrawlerOverviewStatsSchema>;
