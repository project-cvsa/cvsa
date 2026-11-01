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

export const DiscoveryOriginChannelSchema = z.enum(["search", "related", "manual", "graph"]);
export const DiscoveryDecisionOutcomeSchema = z.enum(["accepted", "rejected"]);
export const DiscoveryDecisionBasisSchema = z.enum(["whitelist", "model", "heuristic", "rules"]);
export const DiscoveryDecisionReasonSchema = z.enum([
	"whitelist_match",
	"model_accept",
	"model_reject",
	"model_unavailable",
	"duration_out_of_range",
	"blacklist_match",
]);

export const DiscoverySearchOriginSchema = z.object({
	keyword: z.string(),
	order: z.string(),
	page: z.number().int().positive(),
	position: z.number().int().positive(),
	categoryId: z.number().int().nullable().optional(),
});

export const DiscoveryRelatedOriginSchema = z.object({
	sourceAid: z.string(),
	position: z.number().int().positive(),
});

export const DiscoveryManualOriginSchema = z.object({
	action: z.enum(["ingest", "detail", "seed"]),
});

export const DiscoveryOriginSchema = z.object({
	channel: DiscoveryOriginChannelSchema,
	capturedAt: z.string(),
	search: DiscoverySearchOriginSchema.optional(),
	related: DiscoveryRelatedOriginSchema.optional(),
	manual: DiscoveryManualOriginSchema.optional(),
});

export const DiscoveryDecisionSchema = z.object({
	outcome: DiscoveryDecisionOutcomeSchema,
	basis: DiscoveryDecisionBasisSchema,
	reason: DiscoveryDecisionReasonSchema,
	confidence: z.number(),
	threshold: z.number().nullable().optional(),
	sampled: z.boolean(),
	rules: z
		.object({
			matchedSinger: z.string().optional(),
			matchedIndicator: z.string().optional(),
		})
		.optional(),
	model: z
		.object({
			label: z.number().int(),
			modelVersion: z.string(),
			songProbability: z.number(),
			probabilities: z.array(z.number()),
		})
		.optional(),
});

export const DiscoveryContextSchema = z.object({
	origin: DiscoveryOriginSchema,
	decision: DiscoveryDecisionSchema.optional(),
	job: z
		.object({
			id: z.string(),
			sweepId: z.string().optional(),
		})
		.optional(),
});

export type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;

export const IngestVideoRequestSchema = z.object({
	identifier: z.string().min(1).max(100),
	state: z.enum(["new", "regular", "milestone", "archive"]).optional().default("regular"),
	priority: z.number().int().min(1).max(5).optional().default(2),
});

export const IngestVideoResponseSchema = z.object({
	aid: z.string(),
	bvid: z.string(),
	title: z.string(),
	pic: z.string().nullable(),
	ownerName: z.string().nullable(),
	state: z.string(),
	priority: z.number(),
	alreadyTracked: z.boolean(),
});

export const TestNetworkAdapterResponseSchema = z.object({
	adapterId: z.string(),
	ok: z.boolean(),
	status: z.number().int().optional(),
	latencyMs: z.number(),
	error: z.string().optional(),
});
export type TestNetworkAdapterResponse = z.infer<typeof TestNetworkAdapterResponseSchema>;

export const RecommendationGraphNodeSchema = z.object({
	aid: z.string(),
	bvid: z.string(),
	title: z.string(),
	pic: z.string().nullable(),
	ownerName: z.string().nullable(),
	duration: z.number().int().optional(),
	position: z.number().int().optional(),
	rcmdReason: z.string().optional(),
	isTracked: z.boolean(),
	capturedAt: z.string().optional(),
});
export type RecommendationGraphNode = z.infer<typeof RecommendationGraphNodeSchema>;

export const RecommendationGraphResponseSchema = z.object({
	seed: RecommendationGraphNodeSchema,
	relations: z.array(RecommendationGraphNodeSchema),
});
export type RecommendationGraphResponse = z.infer<typeof RecommendationGraphResponseSchema>;

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

export const DeleteTrackingVideoResponseSchema = z.object({
	ok: z.boolean(),
	aid: z.string(),
});
export type DeleteTrackingVideoResponse = z.infer<typeof DeleteTrackingVideoResponseSchema>;

export const DiscoverySweepRequestSchema = z.object({
	keywords: z.array(z.string().min(1)).min(1).max(50).optional(),
	orders: z
		.array(z.enum(["totalrank", "click", "pubdate", "dm", "stow"]))
		.min(1)
		.max(5)
		.optional(),
	pagesPerQuery: z.number().int().min(1).max(50).optional(),
	categoryId: z.number().int().positive().optional(),
	mode: z.enum(["incremental", "deep"]).optional(),
	timeWindowDays: z.number().positive().max(365).optional(),
	concurrency: z.number().int().min(1).max(10).optional(),
	from: z.number().int().positive().optional(),
	to: z.number().int().positive().optional(),
});

export const TriggerHotSampleRequestSchema = z.object({
	limit: z.number().int().min(1).max(100).optional(),
	timeWindowDays: z.number().positive().max(365).optional(),
});
export type TriggerHotSampleRequest = z.infer<typeof TriggerHotSampleRequestSchema>;

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
	discoveryContext: DiscoveryContextSchema.nullable().optional(),
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
	searchKeywords: z.array(z.string()).optional(),
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
	modelVersion: z.string().nullable().optional(),
	error: z.string().nullable().optional(),
});

export const UpdateDiscoveryFilterConfigRequestSchema = z.object({
	whitelistSingers: z.array(z.string()).optional(),
	whitelistSongIndicators: z.array(z.string()).optional(),
	blacklistKeywords: z.array(z.string()).optional(),
	searchKeywords: z.array(z.string()).optional(),
	minDurationSeconds: z.number().int().positive().optional(),
	maxDurationSeconds: z.number().int().positive().optional(),
	rejectionSampleRate: z.number().min(0).max(1).optional(),
	modelEnabled: z.boolean().optional(),
	modelThreshold: z.number().min(0).max(1).optional(),
});

export const NetworkCooldownSchema = z.object({
	reason: z.literal("upstream_throttle").optional(),
	scope: z.string(),
	remainingMs: z.number().nonnegative(),
	until: z.number(),
});

export const CrawlerStatusDtoSchema = z.object({
	cooldowns: z.array(NetworkCooldownSchema).optional(),
	session: z.lazy(() => BilibiliSessionStatusSchema).optional(),
	ready: z.boolean(),
	revision: z.number().nullable(),
	adapters: z.array(
		z.object({
			id: z.string(),
			enabled: z.boolean(),
			healthState: z.string().optional(),
			healthFactor: z.number().optional(),
			effectiveWeight: z.number().optional(),
			consecutiveFailures: z.number().optional(),
			openUntil: z.number().nullable().optional(),
			requests: z.number().nonnegative().optional(),
			failures: z.number().nonnegative().optional(),
			rateLimited: z.number().nonnegative().optional(),
			averageDurationMs: z.number().nonnegative().nullable().optional(),
			configuredRate: z.number().optional(),
			effectiveRate: z.number().optional(),
			backgroundRate: z.number().optional(),
			adaptiveFactor: z.number().optional(),
			lastThrottledAt: z.number().nullable().optional(),
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

const AdapterBaseSchema = z.object({
	id: AdapterIdSchema,
	enabled: z.boolean().default(true),
	baseWeight: z.number().positive().default(1),
	requestsPerSecond: z.number().positive().max(1000).optional(),
	rateLimits: z.array(NetworkRateLimitSchema).default([]).optional(),
});

function hasSupportedProxyProtocol(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * `createAxiosNetworkTransport` only implements HTTP/HTTPS proxying. Accepting
 * another scheme here would let an operator persist a configuration that can
 * never work, so the protocol is rejected at validation time.
 */
export const HttpProxyUrlSchema = z
	.url()
	.refine(hasSupportedProxyProtocol, "proxyUrl must use the http: or https: protocol");

export const DirectAdapterConfigSchema = AdapterBaseSchema.extend({
	type: z.literal("direct"),
});

export const HttpProxyAdapterConfigSchema = AdapterBaseSchema.extend({
	type: z.literal("http-proxy"),
	proxyUrl: HttpProxyUrlSchema,
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
	failurePenalty: z.number().gt(0).lt(1).default(0.85),
	recoveryBonus: z.number().gt(0).lt(1).default(0.5),
	minWeightFactor: z.number().gte(0).lt(1).default(0.1),
	/** Consecutive health-affecting failures before the adapter is isolated. */
	failureThreshold: z.number().int().positive().max(100).default(20),
	/** How long an isolated adapter stays out of rotation before a probe is allowed. */
	cooldownMs: z.number().int().positive().max(3_600_000).default(10_000),
});

export const BilibiliRequestPurposeSchema = z.enum([
	"tracking",
	"search",
	"details",
	"credentials",
	"diagnostic",
]);
export type BilibiliRequestPurpose = z.infer<typeof BilibiliRequestPurposeSchema>;
export const BILIBILI_REQUEST_TYPES = [
	"bilibili:tracking",
	"bilibili:search",
	"bilibili:details",
	"bilibili:credentials",
	"bilibili:diagnostic",
];
export const BrowserIdentityConfigSchema = z.object({
	family: z.enum(["auto", "chrome", "edge", "safari"]).default("auto"),
	chromeVersion: z
		.string()
		.regex(/^\d+(\.\d+){0,3}$/)
		.default("156.0.8078.80"),
	edgeVersion: z
		.string()
		.regex(/^\d+(\.\d+){0,3}$/)
		.default("156.0.4314.56"),
	safariVersion: z
		.string()
		.regex(/^\d+(\.\d+){0,3}$/)
		.default("27.0"),
	language: z
		.string()
		.min(1)
		.max(200)
		.regex(/^[a-zA-Z0-9,;=. -]+$/)
		.default("zh-CN,zh;q=0.9,en;q=0.8"),
});
export type BrowserIdentityConfig = z.infer<typeof BrowserIdentityConfigSchema>;
export const BilibiliSessionConfigSchema = z.object({
	refreshIntervalMs: z.number().int().min(60000).max(21600000).default(3600000),
	refreshRetryMs: z.number().int().min(1000).max(300000).default(30000),
	recoveryAttempts: z.number().int().min(0).max(2).default(1),
	recoveryCodes: z.array(z.number().int()).max(10).default([]),
	browser: BrowserIdentityConfigSchema.prefault({}),
});
export type BilibiliSessionConfig = z.infer<typeof BilibiliSessionConfigSchema>;
export const BilibiliSessionStatusSchema = z.object({
	generation: z.number().int().nonnegative(),
	ready: z.boolean(),
	refreshing: z.boolean(),
	browser: z.string(),
	lastRefreshAt: z.number().nullable(),
	nextRefreshAt: z.number().nullable(),
	lastRefreshError: z.string().nullable(),
});
export type BilibiliSessionStatus = z.infer<typeof BilibiliSessionStatusSchema>;
export const AdaptiveRateConfigSchema = z.object({
	enabled: z.boolean().default(true),
	minFactor: z.number().min(0.01).max(1).default(0.1),
	decreaseFactor: z.number().gt(0).lt(1).default(0.7),
	recoveryStep: z.number().gt(0).max(1).default(0.05),
	recoverySuccesses: z.number().int().min(1).max(1000).default(20),
	backgroundFactor: z.number().gt(0).max(1).default(0.25),
	backgroundPenaltyMs: z.number().int().min(0).max(3600000).default(60000),
});
export type AdaptiveRateConfig = z.infer<typeof AdaptiveRateConfigSchema>;
export const BilibiliCredentialBundleSchema = z.object({
	buvid3: z.string().min(1),
	buvid4: z.string().min(1),
	bNut: z.string().min(1),
	ticket: z.string().min(1),
	imgKey: z.string().min(1),
	subKey: z.string().min(1),
	refreshedAt: z.number(),
	expiresAt: z.number(),
	identity: z.object({
		family: z.enum(["chrome", "edge", "safari"]),
		version: z.string(),
		language: z.string(),
	}),
});
export type BilibiliCredentialBundle = z.infer<typeof BilibiliCredentialBundleSchema>;
export const BilibiliEnvelopeSchema = z
	.object({
		code: z.number(),
		message: z.string().optional().default(""),
		data: z.unknown().optional(),
	})
	.passthrough();
export const BilibiliDeviceResponseSchema = z.object({
	code: z.literal(0),
	data: z.object({ b_3: z.string().min(1), b_4: z.string().min(1) }),
});
export const BilibiliTicketResponseSchema = z.object({
	code: z.literal(0),
	data: z.object({
		ticket: z.string().min(1),
		nav: z.object({ img: z.string().min(1), sub: z.string().min(1) }),
	}),
});

export const CrawlerExecutionConfigSchema = z.object({
	throttleScope: z.enum(["adapter", "request_type"]).default("adapter"),
	throttleFailover: z.boolean().default(false),
	taskTimeoutMs: z.number().int().min(1000).max(240000).default(120000),
	snapshotConcurrency: z.number().int().min(1).max(200).default(25),
	discoveryConcurrency: z.number().int().min(1).max(100).default(12),
	requestTimeoutMs: z.number().int().min(100).max(120000).default(8000),
	admissionTimeoutMs: z.number().int().min(0).max(10000).default(2000),
	throttleCooldownMs: z.number().int().min(100).max(3600000).default(5000),
	throttleJitterMs: z.number().int().min(0).max(60000).default(5000),
	queueCap: z.number().int().min(1).max(10000).default(200),
	maxAdapterAttempts: z.number().int().min(1).max(10).default(3),
	probeWaitMs: z.number().int().min(10).max(5000).default(100),
	probeRetryMs: z.number().int().min(100).max(60000).default(1000),
	probeRetries: z.number().int().min(0).max(5).default(1),
	maxNetworkCooldownMs: z.number().int().min(1000).max(3600000).default(60000),
	inferenceTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
	mqOperationTimeoutMs: z.number().int().min(1000).max(30000).default(3000),
});
export type CrawlerExecutionConfig = z.infer<typeof CrawlerExecutionConfigSchema>;

export const NetworkRuntimeConfigSchema = z
	.object({
		adapters: z.array(NetworkAdapterConfigSchema),
		bindings: z.array(RequestAdapterBindingSchema).optional(),
		requestTypePolicies: z.record(z.string(), SoftReservePolicySchema).default({}).optional(),
		health: HealthConfigSchema.optional(),
		execution: CrawlerExecutionConfigSchema.optional(),
		session: BilibiliSessionConfigSchema.optional(),
		adaptive: AdaptiveRateConfigSchema.optional(),
	})
	.superRefine((config, context) => {
		const adapterIds = new Set<string>();
		for (const adapter of config.adapters) {
			if (adapterIds.has(adapter.id)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate adapter id: ${adapter.id}`,
				});
			}
			adapterIds.add(adapter.id);
		}
		const requestTypes = new Set<string>();
		for (const binding of config.bindings ?? []) {
			if (requestTypes.has(binding.requestType)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate request binding: ${binding.requestType}`,
				});
			}
			requestTypes.add(binding.requestType);
			for (const adapterId of binding.adapterIds) {
				if (!adapterIds.has(adapterId)) {
					context.addIssue({
						code: "custom",
						message: `Binding ${binding.requestType} refers to unknown adapter ${adapterId}`,
					});
				}
			}
		}
		const totalShare = Object.values(config.requestTypePolicies ?? {}).reduce(
			(sum, policy) => sum + policy.reservedShare,
			0
		);
		if (totalShare > 1 + 1e-9) {
			context.addIssue({
				code: "custom",
				message: `Total reserved share across request types (${totalShare}) must not exceed 1`,
			});
		}
	});

export const NetworkRuntimeConfigDocumentSchema = z.object({
	revision: z.number().int().nonnegative(),
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
export type IngestVideoRequest = z.infer<typeof IngestVideoRequestSchema>;
export type IngestVideoResponse = z.infer<typeof IngestVideoResponseSchema>;
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

export const TrackingAidParamsSchema = z.object({
	aid: z
		.string()
		.regex(/^[1-9]\d{0,18}$/)
		.refine(
			(value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n
		),
});

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

/** Engagement snapshot recorded at a specific point in time. */
export const VideoSnapshotItemSchema = z.object({
	aid: z.string(),
	capturedAt: z.string(),
	views: z.number().int().nonnegative(),
	coins: z.number().int().nonnegative(),
	likes: z.number().int().nonnegative(),
	favorites: z.number().int().nonnegative(),
	shares: z.number().int().nonnegative(),
	danmakus: z.number().int().nonnegative(),
	replies: z.number().int().nonnegative(),
});

export const VideoSnapshotListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export const VideoSnapshotListResponseSchema = z.object({
	items: z.array(VideoSnapshotItemSchema),
	total: z.number().int().nonnegative(),
});

export const QueueSnapshotQuerySchema = z.object({
	force: z
		.union([z.boolean(), z.enum(["true", "false"])])
		.transform((val) => val === true || val === "true")
		.optional(),
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
	pic: z.string().nullable().optional(),
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
	minConfidence: z.coerce.number().min(0).max(1).optional(),
	maxConfidence: z.coerce.number().min(0).max(1).optional(),
	search: z.string().min(1).optional(),
	source: z.enum(["search", "related", "manual", "hot_sample"]).optional(),
	sortBy: z.enum(["confidence", "capturedAt", "aid"]).optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
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
	pic: z.string().nullable().optional(),
	ownerName: z.string().nullable().optional(),
	videoStatus: z.string().optional(),
	filterDecision: z.string().optional(),
	discoverySource: z.string().nullable().optional(),
	discoveryContext: DiscoveryContextSchema.nullable().optional(),
});

export const TrackingVideoSortFieldSchema = z.enum([
	"views",
	"velocity",
	"nextSnapshotAt",
	"consecutiveFails",
	"publishedAt",
	"updatedAt",
]);
export type TrackingVideoSortField = z.infer<typeof TrackingVideoSortFieldSchema>;

export const TrackingVideoListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(20),
	offset: z.coerce.number().int().min(0).default(0),
	state: z.string().min(1).optional(),
	search: z.string().min(1).optional(),
	statusFilter: z.enum(["all", "failing", "highPriority", "normal"]).optional(),
	sortBy: TrackingVideoSortFieldSchema.optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const TrackingVideoListResponseSchema = z.object({
	items: z.array(TrackingVideoListItemSchema),
	total: z.number().int().nonnegative(),
});

// Stats & rollups

export const CrawlerStatsWindowSchema = z.enum(["5m", "15m", "30m", "1h", "6h", "24h", "7d"]);

export const CrawlerStatsQuerySchema = z.object({
	window: CrawlerStatsWindowSchema.default("1h"),
	minutes: z.coerce.number().int().min(1).max(10080).optional(),
});

/** A single persisted rollup bucket for one metric group. */
export const CrawlerStatsRollupPointSchema = z.object({
	bucketTime: z.string(),
	metricGroup: z.string(),
	metrics: z.record(z.string(), z.number()),
});

export const CrawlerStatsErrorBreakdownSchema = z.object({
	timeout: z.number().int().nonnegative(),
	networkFailure: z.number().int().nonnegative().optional(),
	httpFailure: z.number().int().nonnegative().optional(),
	networkOther: z.number().int().nonnegative().optional(),
	adapterUnavailable: z.number().int().nonnegative().optional(),
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

export const DiscoveryJobProgressSchema = z.object({
	stage: z.enum([
		"starting",
		"deferred",
		"searching",
		"evaluating",
		"expanding",
		"sampling",
		"completed",
		"failed",
	]),
	target: z.string().nullable(),
	page: z.number().int().optional(),
	order: z.string().optional(),
	candidates: z.number().int().nonnegative(),
	queued: z.number().int().nonnegative(),
	updatedAt: z.string(),
});
export type DiscoveryJobProgress = z.infer<typeof DiscoveryJobProgressSchema>;

export const DiscoveryActivitySchema = z.object({
	id: z.string(),
	name: z.string(),
	state: z.string(),
	target: z.string().nullable(),
	timestamp: z.number(),
	processedOn: z.number().nullable(),
	finishedOn: z.number().nullable(),
	failedReason: z.string().nullable(),
	progress: DiscoveryJobProgressSchema.nullable(),
});
export type DiscoveryActivity = z.infer<typeof DiscoveryActivitySchema>;

export const DiscoveryQueuedResponseSchema = z.object({ queued: z.literal(true) });
export type DiscoveryQueuedResponse = z.infer<typeof DiscoveryQueuedResponseSchema>;

export const DiscoveryStatusDtoSchema = z.object({
	active: z.boolean(),
	counts: CrawlerQueueSnapshotSchema,
	activeJobs: z.array(DiscoveryActivitySchema),
	recentJobs: z.array(DiscoveryActivitySchema),
	candidatesPerMin: z.number().nonnegative(),
});
export type DiscoveryStatusDto = z.infer<typeof DiscoveryStatusDtoSchema>;

export const CrawlerLatencyStatsSchema = z.object({
	taskP95: z.number().nonnegative(),
	apiP95: z.number().nonnegative(),
	inferenceP95: z.number().nonnegative(),
});

export const CrawlerOverviewStatsSchema = z.object({
	window: CrawlerStatsWindowSchema,
	minutes: z.number().int().min(1).max(10080).optional(),
	// Throughput
	jobsPerSec: z.number().nonnegative(),
	jobsPerMin: z.number().nonnegative(),
	snapshotsSaved: z.number().int().nonnegative().optional(),
	snapshotsPerMin: z.number().nonnegative(),
	videosDiscovered: z.number().int().nonnegative().optional(),
	candidatesPerMin: z.number().nonnegative(),
	inferencesPerSec: z.number().nonnegative(),
	requestsPerSec: z.number().nonnegative(),
	// Errors
	totalAttempts: z.number().int().nonnegative(),
	totalFailures: z.number().int().nonnegative(),
	networkFailures: z.number().int().nonnegative().optional(),
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
export type VideoSnapshotItem = z.infer<typeof VideoSnapshotItemSchema>;
export type VideoSnapshotListQuery = z.infer<typeof VideoSnapshotListQuerySchema>;
export type VideoSnapshotListResponse = z.infer<typeof VideoSnapshotListResponseSchema>;
export type QueueSnapshotQuery = z.infer<typeof QueueSnapshotQuerySchema>;
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

export const CrawlerQueueJobItemSchema = z.object({
	id: z.string(),
	queue: z.enum(["tracking", "discovery"]),
	name: z.string(),
	target: z.string().nullable().optional(),
	state: z.string(),
	attempts: z.number().int().nonnegative(),
	failedReason: z.string().nullable().optional(),
	timestamp: z.number(),
});

export const CrawlerQueueJobDetailSchema = CrawlerQueueJobItemSchema.extend({
	data: z.unknown(),
	opts: z.unknown().optional(),
	stacktrace: z.array(z.string()).nullable().optional(),
	returnvalue: z.unknown().optional(),
	processedOn: z.number().nullable().optional(),
	finishedOn: z.number().nullable().optional(),
});

export const CrawlerQueueNameSchema = z.enum(["tracking", "discovery"]);
export type CrawlerQueueName = z.infer<typeof CrawlerQueueNameSchema>;
export const CrawlerQueueJobParamsSchema = z.object({
	queue: CrawlerQueueNameSchema,
	id: z.string().min(1).max(256),
});
export const CrawlerJobActionResponseSchema = z.object({ ok: z.literal(true) });

export const CrawlerQueueJobsQuerySchema = z.object({
	queue: z.enum(["all", "tracking", "discovery"]).optional(),
	state: z.enum(["all", "active", "waiting", "delayed", "failed", "completed"]).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).optional(),
});

export const CrawlerQueueJobsResponseSchema = z.object({
	items: z.array(CrawlerQueueJobItemSchema),
	total: z.number().int().nonnegative(),
});

export type CrawlerQueueJobItem = z.infer<typeof CrawlerQueueJobItemSchema>;
export type CrawlerQueueJobDetail = z.infer<typeof CrawlerQueueJobDetailSchema>;
export type CrawlerQueueJobsQuery = z.infer<typeof CrawlerQueueJobsQuerySchema>;
export type CrawlerQueueJobsResponse = z.infer<typeof CrawlerQueueJobsResponseSchema>;
