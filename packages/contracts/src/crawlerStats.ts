import { z } from "zod";

export const CRAWLER_WINDOW_MINUTES = {
	"5m": 5,
	"15m": 15,
	"30m": 30,
	"1h": 60,
	"6h": 360,
	"24h": 1440,
	"7d": 10080,
} as const;

export const CRAWLER_STATS_FORMAT_VERSION = 2;
export const CRAWLER_SKETCH_ALGORITHM = "ddsketch";
export const CRAWLER_SKETCH_VERSION = 1;
export const CRAWLER_SKETCH_RELATIVE_ACCURACY = 0.01;
export const CRAWLER_STATS_PERSIST_INTERVAL_MS = 10_000;
export const CRAWLER_STATS_STATE_INTERVAL_MS = 30_000;
export const CRAWLER_STATS_RESOURCE_INTERVAL_MS = 10_000;
export const CRAWLER_STATS_STALE_MS = 60_000;
export const CRAWLER_STATS_STALL_MS = 30_000;

export const CRAWLER_STATS_OUTCOMES = [
	"success",
	"failure",
	"deferred",
	"cancelled",
	"timeout",
] as const;
export const CrawlerStatsOutcomeSchema = z.enum(CRAWLER_STATS_OUTCOMES);
export type CrawlerStatsOutcome = z.infer<typeof CrawlerStatsOutcomeSchema>;

export const CRAWLER_STATS_OPERATIONS = [
	"trackingExecution",
	"discoveryExecution",
	"httpAttempt",
	"logicalRequest",
	"sessionRecovery",
	"modelWait",
	"modelProcess",
	"databaseOperation",
	"redisOperation",
	"metadataRefresh",
	"credentialsRefresh",
	"queueWait",
] as const;
export const CrawlerStatsOperationSchema = z.enum(CRAWLER_STATS_OPERATIONS);
export type CrawlerStatsOperation = z.infer<typeof CrawlerStatsOperationSchema>;

export const CRAWLER_STATS_QUEUES = ["tracking", "discovery"] as const;
export const CrawlerStatsQueueNameSchema = z.enum(CRAWLER_STATS_QUEUES);
export type CrawlerStatsQueueName = z.infer<typeof CrawlerStatsQueueNameSchema>;

export const CRAWLER_DISCOVERY_CHANNELS = ["search", "related", "manual", "hot_sample"] as const;
export const CrawlerDiscoveryChannelSchema = z.enum(CRAWLER_DISCOVERY_CHANNELS);

export const CRAWLER_DEFERRAL_REASONS = [
	"local_budget",
	"upstream_throttle",
	"egress_unavailable",
	"task_retry",
	"queue_capacity",
	"model_unavailable",
] as const;
export const CrawlerDeferralReasonSchema = z.enum(CRAWLER_DEFERRAL_REASONS);
export type CrawlerStatsDeferralReason = z.infer<typeof CrawlerDeferralReasonSchema>;

export const CRAWLER_DATABASE_MODULES = [
	"tracking",
	"discovery",
	"metadata",
	"snapshot",
	"videoStats",
	"networkConfig",
	"stats",
] as const;

export const CRAWLER_REDIS_AREAS = ["mq", "budget", "cooldown"] as const;
export const CrawlerRedisAreaSchema = z.enum(CRAWLER_REDIS_AREAS);

export const CrawlerDistributionSchema = z.object({
	algorithm: z.literal(CRAWLER_SKETCH_ALGORITHM),
	version: z.literal(CRAWLER_SKETCH_VERSION),
	relativeAccuracy: z.number().gt(0).lt(1),
	count: z.number().nonnegative(),
	sum: z.number().nonnegative(),
	min: z.number().nonnegative().nullable(),
	max: z.number().nonnegative().nullable(),
	/** Base64-encoded DDSketch protobuf payload. Empty when there are no samples. */
	data: z.string(),
});
export type CrawlerDistribution = z.infer<typeof CrawlerDistributionSchema>;

export const CrawlerDistributionSummarySchema = z.object({
	count: z.number().nonnegative(),
	mean: z.number().nonnegative().nullable(),
	min: z.number().nonnegative().nullable(),
	max: z.number().nonnegative().nullable(),
	/** Quantile key (`0.5`, `0.9`, ...) -> representative bucket value. */
	quantiles: z.record(z.string(), z.number().nonnegative().nullable()),
});
export type CrawlerDistributionSummary = z.infer<typeof CrawlerDistributionSummarySchema>;

export const CRAWLER_STATS_COUNTER_KEYS = [
	"httpAttemptsStarted",
	"httpAttemptsFinished",
	"httpAttemptsTransportSuccess",
	"httpAttemptsCancelled",
	"egressSwitchResends",
	"sessionRecoveryResends",
	"logicalRequestsStarted",
	"logicalRequestsFinished",
	"logicalRequestSuccess",
	"logicalRequestFailure",
	"logicalRequestTimeout",
	"logicalRequestCancelled",
	"retriedLogicalRequests",
	"retriedLogicalRequestSuccess",
	"trackingJobsStarted",
	"trackingJobsFinished",
	"discoveryJobsStarted",
	"discoveryJobsFinished",
	"candidatesStarted",
	"candidatesFinished",
	"videosRecorded",
	"videoInsertConflicts",
	"trackingCreated",
	"staleLeaseItems",
	"executionsWithoutOutput",
	"enqueueCalls",
	"enqueueSucceeded",
	"enqueueFailed",
	"metadataRefreshSuccess",
	"metadataRefreshFailure",
	"metadataRefreshCancelled",
	"metadataRefreshTimeout",
	"metadataRowsInserted",
	"metadataRowsChanged",
	"metadataRowsUnchanged",
	"deferralLocalBudget",
	"deferralUpstreamThrottle",
	"deferralEgressUnavailable",
	"deferralTaskRetry",
	"trackingLateExecutions",
	"deferralQueueCapacity",
	"deferralModelUnavailable",
	"deferralRequestedMs",
	"credentialsRefreshSuccess",
	"credentialsRefreshFailure",
	"discoveryCandidatesAppeared",
	"discoveryNewTracking",
	"discoveryExisting",
	"discoveryRejected",
	"discoverySkipped",
	"discoveryDeferred",
	"discoveryCancelled",
	"discoveryTimeout",
	"discoveryFailed",
	"modelWaits",
	"modelLoadFailures",
	"modelStarts",
	"modelExits",
	"modelTimeoutTerminations",
	"modelCancelTerminations",
	"modelHealthCalls",
	"modelInferenceCalls",
] as const;
export const CrawlerStatsCounterKeySchema = z.enum(CRAWLER_STATS_COUNTER_KEYS);
export type CrawlerStatsCounterKey = z.infer<typeof CrawlerStatsCounterKeySchema>;

const counters = Object.fromEntries(
	CRAWLER_STATS_COUNTER_KEYS.map((key) => [key, z.number().nonnegative()])
) as { [K in CrawlerStatsCounterKey]: z.ZodNumber };
export const CrawlerStatsCountersV2Schema = z.object(counters);
export type CrawlerStatsCountersV2 = z.infer<typeof CrawlerStatsCountersV2Schema>;

const outcomeCounts = Object.fromEntries(
	CRAWLER_STATS_OUTCOMES.map((outcome) => [outcome, z.number().nonnegative()])
) as { [K in CrawlerStatsOutcome]: z.ZodNumber };
export const CrawlerStatsOutcomeCountsSchema = z.object(outcomeCounts);
export type CrawlerStatsOutcomeCounts = z.infer<typeof CrawlerStatsOutcomeCountsSchema>;

export const CRAWLER_DISCOVERY_RESULTS = [
	"appeared",
	"newTracking",
	"existing",
	"rejected",
	"skipped",
	"deferred",
	"cancelled",
	"timeout",
	"failure",
] as const;
export const CrawlerDiscoveryResultSchema = z.enum(CRAWLER_DISCOVERY_RESULTS);
export type CrawlerDiscoveryResult = z.infer<typeof CrawlerDiscoveryResultSchema>;

const discoveryCounts = Object.fromEntries(
	CRAWLER_DISCOVERY_RESULTS.map((result) => [result, z.number().nonnegative()])
) as { [K in CrawlerDiscoveryResult]: z.ZodNumber };
export const CrawlerDiscoveryResultCountsSchema = z.object(discoveryCounts);
export type CrawlerDiscoveryResultCounts = z.infer<typeof CrawlerDiscoveryResultCountsSchema>;

export const CrawlerStatsJobTotalsSchema = z.object({
	completed: z.number().nonnegative(),
	failed: z.number().nonnegative(),
	deferred: z.number().nonnegative(),
	cancelled: z.number().nonnegative(),
	timeout: z.number().nonnegative(),
});
export type CrawlerStatsJobTotals = z.infer<typeof CrawlerStatsJobTotalsSchema>;

export const CrawlerNetworkTotalsSchema = z.object({
	attempts: z.number().nonnegative(),
	transportSuccess: z.number().nonnegative(),
	transportFailure: z.number().nonnegative(),
	businessSuccess: z.number().nonnegative(),
	businessError: z.number().nonnegative(),
	rateLimited: z.number().nonnegative(),
	cancelled: z.number().nonnegative(),
	timeout: z.number().nonnegative(),
	egressResends: z.number().nonnegative(),
	sessionResends: z.number().nonnegative(),
});
export type CrawlerNetworkTotals = z.infer<typeof CrawlerNetworkTotalsSchema>;

export const CrawlerStatsMinuteV2Schema = z.object({
	version: z.literal(CRAWLER_STATS_FORMAT_VERSION),
	from: z.number(),
	to: z.number(),
	counters: CrawlerStatsCountersV2Schema,
	jobs: z.object({
		tracking: CrawlerStatsJobTotalsSchema,
		discovery: CrawlerStatsJobTotalsSchema,
	}),
	network: z.record(z.string(), CrawlerNetworkTotalsSchema),
	discovery: z.record(z.string(), CrawlerDiscoveryResultCountsSchema),
	discoveryReasons: z.record(
		z.string(),
		z.object({
			accepted: z.number().nonnegative(),
			rejected: z.number().nonnegative(),
		})
	),
	deferrals: z.record(z.string(), z.number().nonnegative()),
	database: z.record(z.string(), CrawlerStatsOutcomeCountsSchema),
	redis: z.record(z.string(), CrawlerStatsOutcomeCountsSchema),
	/** `<operation>:<outcome>` -> latency distribution. */
	distributions: z.record(z.string(), CrawlerDistributionSchema),
});
export type CrawlerStatsMinuteV2 = z.infer<typeof CrawlerStatsMinuteV2Schema>;

export const CRAWLER_LATENCY_BOUNDS_MS = [
	1, 2, 5, 10, 25, 50, 100, 200, 350, 500, 750, 1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000,
	60000, 120000, 300000,
] as const;

/**
 * Legacy (V1) minute format. Kept so persisted rows written before the V2
 * rollout can still be parsed and shown in the dedicated legacy section.
 */
export const CrawlerStatsCountersSchema = z.object({
	jobsCompleted: z.number().nonnegative(),
	snapshotsSaved: z.number().nonnegative(),
	videosDiscovered: z.number().nonnegative(),
	candidatesScanned: z.number().nonnegative(),
	inferencesRun: z.number().nonnegative(),
	networkRequests: z.number().nonnegative(),
	aidsRequested: z.number().nonnegative(),
	aidsReturned: z.number().nonnegative(),
	aidsMissing: z.number().nonnegative(),
	candidatesSeen: z.number().nonnegative(),
	candidatesSkipped: z.number().nonnegative(),
	candidatesRejected: z.number().nonnegative(),
	candidatesFailed: z.number().nonnegative(),
});
export type CrawlerStatsCounters = z.infer<typeof CrawlerStatsCountersSchema>;

export const CrawlerStatsErrorsSchema = z.object({
	timeout: z.number().nonnegative(),
	networkFailure: z.number().nonnegative(),
	httpFailure: z.number().nonnegative(),
	networkOther: z.number().nonnegative(),
	adapterUnavailable: z.number().nonnegative(),
	rateLimited412Or429: z.number().nonnegative(),
	bilibiliBusinessError: z.number().nonnegative(),
	inferenceError: z.number().nonnegative(),
	dbError: z.number().nonnegative(),
	other: z.number().nonnegative(),
});
export type CrawlerStatsErrors = z.infer<typeof CrawlerStatsErrorsSchema>;

const histogram = z
	.array(z.number().int().nonnegative())
	.length(CRAWLER_LATENCY_BOUNDS_MS.length + 1);
const jobTotals = z.object({
	completed: z.number().nonnegative(),
	failed: z.number().nonnegative(),
	deferred: z.number().nonnegative(),
});
export const CrawlerStatsMinuteSchema = z.object({
	from: z.number(),
	to: z.number(),
	counters: CrawlerStatsCountersSchema,
	errors: CrawlerStatsErrorsSchema,
	retries: z.number().nonnegative(),
	latency: z.object({ task: histogram, api: histogram, inference: histogram }),
	latencyMaxMs: z.object({
		task: z.number().nonnegative(),
		api: z.number().nonnegative(),
		inference: z.number().nonnegative(),
	}),
	jobs: z.object({ tracking: jobTotals, discovery: jobTotals }),
	network: z.record(
		z.string(),
		z.object({
			requests: z.number().nonnegative(),
			success: z.number().nonnegative(),
			businessErrors: z.number().nonnegative(),
			rateLimited: z.number().nonnegative(),
			transportFailures: z.number().nonnegative(),
		})
	),
	gauges: z
		.object({
			sampledAt: z.number(),
			waiting: z.number().nonnegative(),
			active: z.number().nonnegative(),
			overdue: z.number().nonnegative(),
		})
		.optional(),
});
export type CrawlerStatsMinute = z.infer<typeof CrawlerStatsMinuteSchema>;
/** @deprecated Use {@link CrawlerStatsMinute}. */
export const CrawlerMinuteMetricsSchema = CrawlerStatsMinuteSchema;
export type CrawlerMinuteMetrics = CrawlerStatsMinute;

export const CRAWLER_RATE_METRICS = [
	{
		key: "videosPerMin",
		counter: "videosRecorded",
		label: "overview.newSnapshots",
		unit: "/min",
	},
	{
		key: "jobsPerMin",
		counter: "trackingJobsFinished",
		label: "overview.jobsPerSec",
		unit: "/min",
	},
	{
		key: "requestsPerMin",
		counter: "httpAttemptsFinished",
		label: "overview.requestsPerSec",
		unit: "/min",
	},
	{
		key: "inferencesPerMin",
		counter: "modelInferenceCalls",
		label: "overview.inferencesPerSec",
		unit: "/min",
	},
	{
		key: "candidatesPerMin",
		counter: "candidatesFinished",
		label: "overview.candidatesPerMin",
		unit: "/min",
	},
] as const;

export const CRAWLER_ERROR_LABELS = {
	timeout: "overview.err.timeout",
	networkFailure: "overview.err.networkFailure",
	httpFailure: "overview.err.httpFailure",
	networkOther: "overview.err.networkOther",
	adapterUnavailable: "overview.err.adapterUnavailable",
	rateLimited412Or429: "overview.err.rateLimited",
	bilibiliBusinessError: "overview.err.bilibiliBusiness",
	inferenceError: "overview.err.inference",
	dbError: "overview.err.db",
	other: "overview.err.other",
} as const;

export const CRAWLER_CHART_METRICS = [
	{ key: "videosPerMin", label: "overview.newSnapshots", unit: "/min", format: "number" },
	{ key: "jobsPerMin", label: "overview.jobsPerSec", unit: "/min", format: "number" },
	{ key: "requestsPerMin", label: "overview.requestsPerSec", unit: "/min", format: "number" },
	{
		key: "inferencesPerMin",
		label: "overview.inferencesPerSec",
		unit: "/min",
		format: "number",
	},
	{ key: "candidatesPerMin", label: "overview.candidatesPerMin", unit: "/min", format: "number" },
	{
		key: "ratios.httpTransportSuccess",
		label: "metrics.ratio.httpTransportSuccess",
		unit: "",
		format: "percent",
	},
	{
		key: "ratios.logicalRequestSuccess",
		label: "metrics.ratio.logicalRequestSuccess",
		unit: "",
		format: "percent",
	},
	{
		key: "ratios.egressResendShare",
		label: "metrics.ratio.egressResendShare",
		unit: "",
		format: "percent",
	},
	{
		key: "ratios.sessionResendShare",
		label: "metrics.ratio.sessionResendShare",
		unit: "",
		format: "percent",
	},
	{
		key: "ratios.retryRecoverySuccess",
		label: "metrics.ratio.retryRecoverySuccess",
		unit: "",
		format: "percent",
	},
	{
		key: "latency.trackingExecution",
		label: "audit.chart.taskLatency",
		unit: "ms",
		format: "number",
	},
	{
		key: "latency.httpAttempt",
		label: "audit.chart.apiLatency",
		unit: "ms",
		format: "number",
	},
	{
		key: "latency.modelProcess",
		label: "metrics.inferenceLatency",
		unit: "ms",
		format: "number",
	},
	{ key: "queue.waiting", label: "queue.waiting", unit: "", format: "number" },
	{ key: "queue.active", label: "queue.active", unit: "", format: "number" },
	{ key: "tracking.overdue", label: "overview.overdueTracking", unit: "", format: "number" },
] as const;
export type CrawlerChartMetric = (typeof CRAWLER_CHART_METRICS)[number];

export const CrawlerStatsCoverageSchema = z.object({
	status: z.enum(["complete", "partial", "none"]),
	from: z.string(),
	to: z.string(),
	minutes: z.number().int().nonnegative(),
	coveredMinutes: z.number().int().nonnegative(),
	missingMinutes: z.number().int().nonnegative(),
	/** First instant after which data from a participating instance is unconfirmed. */
	unconfirmedFrom: z.number().nullable(),
	/** True when part of the requested range predates V2 collection. */
	legacy: z.boolean(),
	enabledAt: z.string().nullable(),
	/** Metric groups whose activation instant is after the requested range starts. */
	unavailableMetrics: z.array(z.string()),
});
export type CrawlerStatsCoverage = z.infer<typeof CrawlerStatsCoverageSchema>;

export const CrawlerStatsRatioSchema = z.object({
	httpTransportSuccess: z.number().min(0).max(1).nullable(),
	logicalRequestSuccess: z.number().min(0).max(1).nullable(),
	egressResendShare: z.number().min(0).max(1).nullable(),
	sessionResendShare: z.number().min(0).max(1).nullable(),
	retryRecoverySuccess: z.number().min(0).max(1).nullable(),
	requestsPerRecord: z.number().nonnegative().nullable(),
});
export type CrawlerStatsRatio = z.infer<typeof CrawlerStatsRatioSchema>;

export const CrawlerStatsRatioInputsSchema = z.object({
	httpAttemptsFinished: z.number().nonnegative(),
	httpAttemptsCancelled: z.number().nonnegative(),
	httpTransportSuccess: z.number().nonnegative(),
	logicalRequests: z.number().nonnegative(),
	logicalRequestSuccess: z.number().nonnegative(),
	egressResends: z.number().nonnegative(),
	sessionResends: z.number().nonnegative(),
	retriedLogicalRequests: z.number().nonnegative(),
	retriedLogicalRequestSuccess: z.number().nonnegative(),
	videosRecorded: z.number().nonnegative(),
});
export type CrawlerStatsRatioInputs = z.infer<typeof CrawlerStatsRatioInputsSchema>;

export const CrawlerStatsPersistenceSchema = z.object({
	state: z.enum(["ok", "persistence_stalled", "heartbeat_expired", "unknown"]),
	lastSuccessAt: z.string().nullable(),
	lastHeartbeatAt: z.string().nullable(),
	lastError: z.string().nullable(),
	pendingMinutes: z.number().int().nonnegative(),
	oldestPendingAgeSec: z.number().nonnegative().nullable(),
	writeSuccesses: z.number().int().nonnegative(),
	writeFailures: z.number().int().nonnegative(),
	writeDurationMs: CrawlerDistributionSummarySchema.nullable(),
	pendingHours: z.number().int().nonnegative(),
	oldestPendingHourAgeSec: z.number().nonnegative().nullable(),
	rollupFailures: z.number().int().nonnegative(),
});
export type CrawlerStatsPersistence = z.infer<typeof CrawlerStatsPersistenceSchema>;

export const CrawlerStatsInstanceSchema = z.object({
	instanceId: z.string(),
	startedAt: z.string(),
	exitedAt: z.string().nullable(),
	lastPersistedAt: z.string(),
	coveredTo: z.string(),
	heartbeatAt: z.string().nullable(),
	active: z.boolean(),
});
export type CrawlerStatsInstance = z.infer<typeof CrawlerStatsInstanceSchema>;

export const CrawlerStatsQueueStateSchema = z.object({
	waiting: z.number().int().nonnegative(),
	prioritized: z.number().int().nonnegative(),
	active: z.number().int().nonnegative(),
	delayed: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	completed: z.number().int().nonnegative(),
	oldestWaitSec: z.number().nonnegative(),
	activeAgeSec: z.number().nonnegative(),
});

export type CrawlerStatsQueueState = z.infer<typeof CrawlerStatsQueueStateSchema>;

export const CrawlerStatsFreshnessSchema = z.object({
	count: z.number().int().nonnegative(),
	meanSec: z.number().nonnegative().nullable(),
	quantilesSec: z.record(z.string(), z.number().nonnegative().nullable()),
	maxSec: z.number().nonnegative().nullable(),
});
export type CrawlerStatsFreshness = z.infer<typeof CrawlerStatsFreshnessSchema>;

export const CrawlerStatsTrackingStateSchema = z.object({
	total: z.number().int().nonnegative(),
	byState: z.record(z.string(), z.number().int().nonnegative()),
	byPriority: z.record(z.string(), z.number().int().nonnegative()),
	neverCaptured: z.number().int().nonnegative(),
	freshness: CrawlerStatsFreshnessSchema,
	freshnessByState: z.record(z.string(), CrawlerStatsFreshnessSchema),
	freshnessByPriority: z.record(z.string(), CrawlerStatsFreshnessSchema),
	dueNow: z.number().int().nonnegative(),
	metadataDue: z.number().int().nonnegative(),
	maxOverdueLagSec: z.number().nonnegative(),
});

export type CrawlerStatsTrackingState = z.infer<typeof CrawlerStatsTrackingStateSchema>;

export const CrawlerStatsModelStateSchema = z.object({
	reachable: z.boolean().nullable(),
	modelsLoaded: z.boolean().nullable(),
	modelVersion: z.string().nullable(),
	activeRequests: z.number().int().nonnegative(),
	waitingRequests: z.number().int().nonnegative(),
	loadFailures: z.number().int().nonnegative(),
	starts: z.number().int().nonnegative(),
	exits: z.number().int().nonnegative(),
	timeoutTerminations: z.number().int().nonnegative(),
	cancelTerminations: z.number().int().nonnegative(),
});

export type CrawlerStatsModelState = z.infer<typeof CrawlerStatsModelStateSchema>;

export const CrawlerStatsResourceProcessSchema = z.object({
	id: z.string(),
	role: z.enum(["parent", "model"]),
	cpuPercent: z.number().nonnegative(),
	rssBytes: z.number().nonnegative(),
});
export const CrawlerStatsResourceStateSchema = z.object({
	sampledAt: z.string(),
	processes: z.array(CrawlerStatsResourceProcessSchema),
	eventLoopDelayMs: z.number().nonnegative().nullable(),
});

export type CrawlerStatsResourceState = z.infer<typeof CrawlerStatsResourceStateSchema>;

export const CRAWLER_STRATEGY_KEYS = [
	"health",
	"adaptive",
	"requestTypePolicies",
	"rateLimits",
	"cooldown",
] as const;
export const CrawlerStrategyKeySchema = z.enum(CRAWLER_STRATEGY_KEYS);
export const CrawlerStrategySupportSchema = z.enum(["active", "not_wired", "configured_not_wired"]);
export const CrawlerStrategyStatusSchema = z.object({
	key: CrawlerStrategyKeySchema,
	support: CrawlerStrategySupportSchema,
	configured: z.boolean(),
	healthFactor: z.number().nullable(),
	adaptiveFactor: z.number().nullable(),
	reservedShare: z.number().nullable(),
});
export type CrawlerStrategyStatus = z.infer<typeof CrawlerStrategyStatusSchema>;

export const CrawlerStatsExportStateSchema = z.object({
	enabled: z.boolean(),
	successes: z.number().int().nonnegative(),
	failures: z.number().int().nonnegative(),
	lastSuccessAt: z.string().nullable(),
	durationMs: CrawlerDistributionSummarySchema.nullable(),
	lastResult: z.enum(["success", "failure", "not_exported"]),
	lastError: z.string().nullable(),
});

export type CrawlerStatsExportState = z.infer<typeof CrawlerStatsExportStateSchema>;

export const CrawlerStatsLabelingSchema = z.object({
	samples: z.number().int().nonnegative(),
	truePositive: z.number().int().nonnegative(),
	falsePositive: z.number().int().nonnegative(),
	trueNegative: z.number().int().nonnegative(),
	falseNegative: z.number().int().nonnegative(),
	accuracy: z.number().min(0).max(1).nullable(),
	precision: z.number().min(0).max(1).nullable(),
	recall: z.number().min(0).max(1).nullable(),
});

export const CrawlerStatsDiscoverySchema = z.object({
	byChannel: z.record(z.string(), CrawlerDiscoveryResultCountsSchema),
	byReason: z.record(
		z.string(),
		z.object({
			accepted: z.number().nonnegative(),
			rejected: z.number().nonnegative(),
		})
	),
	byModelVersion: z.record(z.string(), z.number().nonnegative()),
});

export type CrawlerStatsDatabase = z.infer<typeof CrawlerStatsDatabaseSchema>;

export const CrawlerStatsDatabaseSchema = z.object({
	byOperation: z.record(z.string(), CrawlerStatsOutcomeCountsSchema),
	durationMs: z.record(z.string(), CrawlerDistributionSummarySchema),
});

export type CrawlerStatsRedis = z.infer<typeof CrawlerStatsRedisSchema>;

export const CrawlerStatsRedisSchema = z.object({
	byCommand: z.record(z.string(), CrawlerStatsOutcomeCountsSchema),
	durationMs: z.record(z.string(), CrawlerDistributionSummarySchema),
});

export type CrawlerStatsLatency = z.infer<typeof CrawlerStatsLatencySchema>;

export const CrawlerStatsLatencySchema = z.record(z.string(), CrawlerDistributionSummarySchema);

export const CrawlerStatsRollupPointSchema = z.object({
	bucketTime: z.string(),
	metricGroup: z.string(),
	metrics: z.record(z.string(), z.number().nullable()),
	coverage: z.enum(["complete", "partial", "none"]),
});
export type CrawlerStatsRollupPoint = z.infer<typeof CrawlerStatsRollupPointSchema>;

export const CrawlerStatsLegacySchema = z.object({
	window: z.string(),
	from: z.string(),
	to: z.string(),
	counters: CrawlerStatsCountersSchema,
	errors: CrawlerStatsErrorsSchema,
	latencyP95Ms: z.record(z.string(), z.number().nonnegative()),
});

export const CrawlerOverviewStatsSchema = z.object({
	version: z.literal(CRAWLER_STATS_FORMAT_VERSION),
	window: z.enum(["5m", "15m", "30m", "1h", "6h", "24h", "7d"]),
	minutes: z.number().int().min(1).max(10080).optional(),
	generatedAt: z.string(),
	range: z.object({ from: z.string(), to: z.string(), seconds: z.number().nonnegative() }),
	coverage: CrawlerStatsCoverageSchema,
	counters: CrawlerStatsCountersV2Schema,
	jobs: z.object({
		tracking: CrawlerStatsJobTotalsSchema,
		discovery: CrawlerStatsJobTotalsSchema,
	}),
	network: z.record(z.string(), CrawlerNetworkTotalsSchema),
	ratios: CrawlerStatsRatioSchema,
	ratioInputs: CrawlerStatsRatioInputsSchema,
	latency: CrawlerStatsLatencySchema,
	persistence: CrawlerStatsPersistenceSchema,
	instances: z.array(CrawlerStatsInstanceSchema),
	current: z.object({
		sampledAt: z.string().nullable(),
		stale: z.boolean(),
		queues: z.record(z.string(), CrawlerStatsQueueStateSchema),
		tracking: CrawlerStatsTrackingStateSchema,
		model: CrawlerStatsModelStateSchema,
		resources: CrawlerStatsResourceStateSchema.nullable(),
		export: CrawlerStatsExportStateSchema,
		strategies: z.array(CrawlerStrategyStatusSchema),
	}),
	discovery: CrawlerStatsDiscoverySchema,
	labeling: CrawlerStatsLabelingSchema,
	/** Distinct videos with a snapshot captured inside the range. */
	videoCoverage: z.number().int().nonnegative().nullable(),
	database: CrawlerStatsDatabaseSchema,
	redis: CrawlerStatsRedisSchema,
	series: z.array(CrawlerStatsRollupPointSchema),
	legacy: CrawlerStatsLegacySchema.nullable(),
});
export type CrawlerOverviewStats = z.infer<typeof CrawlerOverviewStatsSchema>;

export interface CrawlerMetricDefinition {
	id: string;
	zh: string;
	en: string;
	unit: string;
	definitionZh: string;
	definitionEn: string;
}

/**
 * Shared metric registry. The API returns IDs and values; both admin pages and
 * help text read names, units, and definitions from this single list.
 */
export const CRAWLER_METRIC_CATALOG: CrawlerMetricDefinition[] = [
	{
		id: "videosRecorded",
		zh: "新增快照记录",
		en: "New snapshot records",
		unit: "count",
		definitionZh: "数据库实际插入的快照行数，唯一键冲突不计数。",
		definitionEn: "Snapshot rows actually inserted; unique-key conflicts are excluded.",
	},
	{
		id: "videosPerMin",
		zh: "快照写入速率",
		en: "Snapshot write rate",
		unit: "/min",
		definitionZh: "区间内实际插入快照数除以区间分钟数。",
		definitionEn: "Inserted snapshots divided by the range length in minutes.",
	},
	{
		id: "trackingCreated",
		zh: "新建 Tracking",
		en: "Tracking rows created",
		unit: "count",
		definitionZh: "数据库实际新建的 Tracking 行数。",
		definitionEn: "Tracking rows actually created in the database.",
	},
	{
		id: "httpAttempts",
		zh: "HTTP 尝试",
		en: "HTTP attempts",
		unit: "count",
		definitionZh: "实际发送并结束的单次 HTTP 请求数。",
		definitionEn: "Single HTTP requests actually sent and finished.",
	},
	{
		id: "logicalRequests",
		zh: "逻辑请求",
		en: "Logical requests",
		unit: "count",
		definitionZh: "一次 Bilibili 会话请求调用，包含出口切换与会话恢复。",
		definitionEn: "One Bilibili session call, including exit failover and session recovery.",
	},
	{
		id: "candidatesScanned",
		zh: "候选处理",
		en: "Candidates processed",
		unit: "count",
		definitionZh: "进入候选处理入口的次数，重复出现仍分别计数。",
		definitionEn: "Entries into candidate processing; repeats are counted separately.",
	},
	{
		id: "ratios.httpTransportSuccess",
		zh: "HTTP 传输成功率",
		en: "HTTP transport success rate",
		unit: "ratio",
		definitionZh: "HTTP 2xx 尝试数除以已结束尝试数减去取消数。",
		definitionEn: "2xx attempts over finished attempts minus cancellations.",
	},
	{
		id: "ratios.logicalRequestSuccess",
		zh: "逻辑请求成功率",
		en: "Logical request success rate",
		unit: "ratio",
		definitionZh: "业务成功的逻辑请求除以成功、失败与超时之和。",
		definitionEn: "Business-successful calls over success, failure and timeout calls.",
	},
	{
		id: "ratios.egressResendShare",
		zh: "出口重试发送占比",
		en: "Egress resend share",
		unit: "ratio",
		definitionZh: "出口切换触发的已结束尝试除以全部已结束尝试。",
		definitionEn: "Finished attempts caused by exit failover over all finished attempts.",
	},
	{
		id: "ratios.sessionResendShare",
		zh: "会话恢复重发占比",
		en: "Session resend share",
		unit: "ratio",
		definitionZh: "会话恢复触发的已结束尝试除以全部已结束尝试。",
		definitionEn: "Finished attempts caused by session recovery over all finished attempts.",
	},
	{
		id: "ratios.retryRecoverySuccess",
		zh: "重试恢复成功率",
		en: "Retry recovery success rate",
		unit: "ratio",
		definitionZh: "直接尝试数大于 1 且业务成功的逻辑请求占比。",
		definitionEn: "Successful calls whose direct attempt count exceeded one.",
	},
	{
		id: "ratios.requestsPerRecord",
		zh: "每条新增记录对应的区间请求数",
		en: "Requests per new record",
		unit: "ratio",
		definitionZh: "区间内已结束 HTTP 尝试数除以实际新增统计记录数。",
		definitionEn: "Finished HTTP attempts divided by newly inserted records in the range.",
	},
	{
		id: "latency",
		zh: "耗时分布",
		en: "Latency distribution",
		unit: "ms",
		definitionZh: "按操作与结果分组的 DDSketch 合并分布，分位数由合并后的分布计算。",
		definitionEn: "DDSketch merged per operation and outcome; quantiles use the merged data.",
	},
	{
		id: "queue.oldestWait",
		zh: "最老等待任务年龄",
		en: "Oldest waiting job age",
		unit: "s",
		definitionZh: "当前等待集合中最早首次入队时间到现在的秒数。",
		definitionEn: "Seconds since the earliest first-enqueue time in the waiting set.",
	},
	{
		id: "queue.activeAge",
		zh: "当前执行年龄",
		en: "Active job age",
		unit: "s",
		definitionZh: "当前执行任务本次 processedOn 到现在的秒数。",
		definitionEn: "Seconds since the current job's processedOn timestamp.",
	},
	{
		id: "tracking.neverCaptured",
		zh: "从未成功采集",
		en: "Never captured",
		unit: "count",
		definitionZh: "lastCapturedAt 为空的 Tracking 行数。",
		definitionEn: "Tracking rows whose lastCapturedAt is empty.",
	},
	{
		id: "tracking.freshness",
		zh: "采集新鲜度",
		en: "Capture freshness",
		unit: "s",
		definitionZh: "当前时间与 lastCapturedAt 的差值，按状态与优先级分组统计。",
		definitionEn: "Current time minus lastCapturedAt, grouped by state and priority.",
	},
	{
		id: "persistence.pending",
		zh: "待写入分钟数",
		en: "Pending minutes",
		unit: "count",
		definitionZh: "已记录但尚未成功写入统计数据库的分钟数量。",
		definitionEn: "Minutes recorded but not yet persisted to the stats database.",
	},
	{
		id: "export.state",
		zh: "OTLP 导出状态",
		en: "OTLP export status",
		unit: "state",
		definitionZh: "最近一次导出结果、成功与失败次数以及最后成功时间。",
		definitionEn: "Last export result, success and failure counts, and last success time.",
	},
];

export const CRAWLER_METRIC_DEFINITIONS: Record<string, CrawlerMetricDefinition> =
	Object.fromEntries(CRAWLER_METRIC_CATALOG.map((metric) => [metric.id, metric]));
