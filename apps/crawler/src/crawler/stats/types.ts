import {
	CRAWLER_STATS_COUNTER_KEYS,
	CRAWLER_STATS_OUTCOMES,
	CRAWLER_STATS_OPERATIONS,
	type CrawlerDistributionSummary,
	type CrawlerStatsJobTotals,
	type CrawlerNetworkTotals,
	type CrawlerDiscoveryResult,
	type CrawlerDiscoveryResultCounts,
	type CrawlerStatsCounterKey,
	type CrawlerStatsMinuteV2,
	type CrawlerStatsOutcome,
	type CrawlerStatsOutcomeCounts,
	type CrawlerStatsQueueName,
	type CrawlerStatsCountersV2,
	type CrawlerStatsWindow,
	type CrawlerStatsDeferralReason,
} from "@cvsa/contracts";

export type StatsWindow = CrawlerStatsWindow;
export type StatsCounter = CrawlerStatsCounterKey;
export type StatsOutcome = CrawlerStatsOutcome;
export type StatsOperation = (typeof CRAWLER_STATS_OPERATIONS)[number];
export type StatsQueueName = CrawlerStatsQueueName;
export type StatsJobTotals = CrawlerStatsJobTotals;
export type StatsOutcomeCounts = CrawlerStatsOutcomeCounts;
export type StatsDiscoveryResult = CrawlerDiscoveryResult;
export type StatsDiscoveryCounts = CrawlerDiscoveryResultCounts;
export type StatsMinute = CrawlerStatsMinuteV2;

export const STATS_COUNTERS = CRAWLER_STATS_COUNTER_KEYS;
export const STATS_OUTCOMES = CRAWLER_STATS_OUTCOMES;
export const STATS_OPERATIONS = CRAWLER_STATS_OPERATIONS;

/** Normalized network outcome the collector maps onto transport semantics. */
export type StatsNetworkOutcome =
	| "success"
	| "business_error"
	| "http_error"
	| "rate_limited"
	| "timeout"
	| "connection_error"
	| "cancelled"
	| "other_error";

export interface StatsNetworkAttributes {
	requestType?: string;
	endpoint?: string;
	egress?: string;
	retry?: number;
}

export interface StatsDeferral {
	reason: CrawlerStatsDeferralReason;
	requestedMs?: number;
}

/** Queue depth, mirrored from BullMQ `getJobCounts()`. */
export interface StatsQueueCounts {
	waiting: number;
	prioritized: number;
	active: number;
	delayed: number;
	failed: number;
	completed: number;
}

export interface StatsQueueSnapshot extends StatsQueueCounts {
	oldestWaitSec: number;
	activeAgeSec: number;
}

export interface StatsTrackingState {
	total: number;
	byState: Record<string, number>;
	byPriority: Record<string, number>;
	neverCaptured: number;
	freshness: {
		count: number;
		meanSec: number | null;
		quantilesSec: Record<string, number | null>;
		maxSec: number | null;
	};
	freshnessByState: Record<string, StatsTrackingState["freshness"]>;
	freshnessByPriority: Record<string, StatsTrackingState["freshness"]>;
	dueNow: number;
	metadataDue: number;
	maxOverdueLagSec: number;
}

export interface StatsModelState {
	reachable: boolean | null;
	modelsLoaded: boolean | null;
	modelVersion: string | null;
	activeRequests: number;
	waitingRequests: number;
	loadFailures: number;
	starts: number;
	exits: number;
	timeoutTerminations: number;
	cancelTerminations: number;
}

export interface StatsResourceProcess {
	id: string;
	role: "parent" | "model";
	cpuPercent: number;
	rssBytes: number;
}

export interface StatsResourceState {
	sampledAt: string;
	processes: StatsResourceProcess[];
	eventLoopDelayMs: number | null;
}

export interface StatsExportState {
	enabled: boolean;
	successes: number;
	failures: number;
	lastSuccessAt: string | null;
	durationMs: CrawlerDistributionSummary | null;
	lastResult: "success" | "failure" | "not_exported";
	lastError: string | null;
}

export interface StatsLabelingState {
	samples: number;
	truePositive: number;
	falsePositive: number;
	trueNegative: number;
	falseNegative: number;
	accuracy: number | null;
	precision: number | null;
	recall: number | null;
}

export interface StatsInstanceState {
	instanceId: string;
	startedAt: number;
	exitedAt: number | null;
	lastPersistedAt: number;
	coveredTo: number;
	heartbeatAt: number | null;
}

export interface StatsStrategyState {
	key: "health" | "adaptive" | "requestTypePolicies" | "rateLimits" | "cooldown";
	support: "active" | "not_wired" | "configured_not_wired";
	configured: boolean;
	healthFactor: number | null;
	adaptiveFactor: number | null;
	reservedShare: number | null;
}

/** Read-only side data the overview needs beyond the persisted counters. */
export interface StatsOverviewDeps {
	queueCounts?: () => Promise<Record<StatsQueueName, StatsQueueSnapshot>>;
	trackingState?: (now: number) => Promise<StatsTrackingState>;
	modelState?: () => Promise<StatsModelState>;
	resourceState?: () => Promise<StatsResourceState>;
	exportState?: () => Promise<StatsExportState>;
	strategies?: () => Promise<StatsStrategyState[]>;
	labeling?: (from: number, to: number) => Promise<StatsLabelingState>;
	videoCoverage?: (from: number, to: number) => Promise<number>;
	heartbeat?: (instanceId: string) => Promise<number | null>;
	legacyWindow?: (from: number, to: number) => Promise<LegacyWindowMetrics | null>;
}

export interface LegacyWindowMetrics {
	counters: import("@cvsa/contracts").CrawlerStatsCounters;
	errors: import("@cvsa/contracts").CrawlerStatsErrors;
	latencyP95Ms: Record<string, number>;
}

export interface StatsMetricSink {
	recordCounter(kind: StatsCounter, count: number): void;
	recordJobOutcome(queue: StatsQueueName, outcome: StatsOutcome): void;
	recordLatency(operation: StatsOperation, outcome: StatsOutcome, ms: number): void;
	recordDiscovery(channel: string, result: StatsDiscoveryResult): void;
	recordDeferral(reason: string): void;
	recordDatabase(module: string, operation: string, outcome: StatsOutcome): void;
	recordRedis(area: string, command: string, outcome: StatsOutcome): void;
	recordQueue(queue: StatsQueueName, counts: StatsQueueCounts): void;
	recordTracking(tracking: { overdueCount: number; maxOverdueLagSec: number }): void;
}

/**
 * The recording surface consumers depend on.
 *
 * One entry point exists per event family so a result is never recorded twice
 * by two different layers.
 */
export interface StatsRecorder {
	record(counter: StatsCounter, count?: number): void;
	recordJobStarted(queue: StatsQueueName): void;
	recordJobOutcome(queue: StatsQueueName, outcome: StatsOutcome, latencyMs?: number): void;
	recordQueueWait(latencyMs: number): void;
	recordHttpAttemptStarted(attributes?: StatsNetworkAttributes): void;
	recordHttpAttempt(
		latencyMs: number,
		outcome: StatsNetworkOutcome,
		attributes?: StatsNetworkAttributes
	): void;
	recordLogicalRequest(latencyMs: number, outcome: StatsOutcome, attempts: number): void;
	recordSessionRecovery(latencyMs: number, outcome: StatsOutcome): void;
	recordDiscovery(channel: string, result: StatsDiscoveryResult): void;
	recordDiscoveryDecision(reason: string, accepted: boolean): void;
	recordDeferral(deferral: StatsDeferral): void;
	recordDatabase(
		module: string,
		operation: string,
		latencyMs: number,
		outcome?: StatsOutcome
	): void;
	recordRedis(area: string, command: string, latencyMs: number, outcome?: StatsOutcome): void;
	recordMetadataRefresh(
		outcome: StatsOutcome,
		latencyMs: number,
		rows: { inserted: number; changed: number; unchanged: number }
	): void;
	recordCredentialsRefresh(outcome: StatsOutcome, latencyMs: number): void;
	recordModelInference(latencyMs: number, succeeded: boolean): void;
	recordModelWait(latencyMs: number, outcome: StatsOutcome): void;
	recordModelLifecycle(
		kind: "loadFailure" | "start" | "exit" | "timeoutTermination" | "cancelTermination"
	): void;
	recordModelHealth(latencyMs: number, reachable: boolean): void;
}

/** No-op recorder for call sites that run without stats collection. */
export function createNoopStatsRecorder(): StatsRecorder {
	return {
		record() {},
		recordJobStarted() {},
		recordJobOutcome() {},
		recordQueueWait() {},
		recordHttpAttemptStarted() {},
		recordHttpAttempt() {},
		recordLogicalRequest() {},
		recordSessionRecovery() {},
		recordDiscovery() {},
		recordDiscoveryDecision() {},
		recordDeferral() {},
		recordDatabase() {},
		recordRedis() {},
		recordMetadataRefresh() {},
		recordCredentialsRefresh() {},
		recordModelInference() {},
		recordModelWait() {},
		recordModelLifecycle() {},
		recordModelHealth() {},
	};
}

const EMPTY_COUNTERS: CrawlerStatsCountersV2 = {
	httpAttemptsStarted: 0,
	httpAttemptsFinished: 0,
	httpAttemptsTransportSuccess: 0,
	httpAttemptsCancelled: 0,
	egressSwitchResends: 0,
	sessionRecoveryResends: 0,
	logicalRequestsStarted: 0,
	logicalRequestsFinished: 0,
	logicalRequestSuccess: 0,
	logicalRequestFailure: 0,
	logicalRequestTimeout: 0,
	logicalRequestCancelled: 0,
	retriedLogicalRequests: 0,
	retriedLogicalRequestSuccess: 0,
	trackingJobsStarted: 0,
	trackingJobsFinished: 0,
	discoveryJobsStarted: 0,
	discoveryJobsFinished: 0,
	candidatesStarted: 0,
	candidatesFinished: 0,
	videosRecorded: 0,
	videoInsertConflicts: 0,
	trackingCreated: 0,
	staleLeaseItems: 0,
	executionsWithoutOutput: 0,
	enqueueCalls: 0,
	enqueueSucceeded: 0,
	enqueueFailed: 0,
	metadataRefreshSuccess: 0,
	metadataRefreshFailure: 0,
	metadataRefreshCancelled: 0,
	metadataRefreshTimeout: 0,
	metadataRowsInserted: 0,
	metadataRowsChanged: 0,
	metadataRowsUnchanged: 0,
	deferralLocalBudget: 0,
	deferralUpstreamThrottle: 0,
	deferralEgressUnavailable: 0,
	deferralTaskRetry: 0,
	trackingLateExecutions: 0,
	deferralQueueCapacity: 0,
	deferralModelUnavailable: 0,
	deferralRequestedMs: 0,
	credentialsRefreshSuccess: 0,
	credentialsRefreshFailure: 0,
	discoveryCandidatesAppeared: 0,
	discoveryNewTracking: 0,
	discoveryExisting: 0,
	discoveryRejected: 0,
	discoverySkipped: 0,
	discoveryDeferred: 0,
	discoveryCancelled: 0,
	discoveryTimeout: 0,
	discoveryFailed: 0,
	modelWaits: 0,
	modelLoadFailures: 0,
	modelStarts: 0,
	modelExits: 0,
	modelTimeoutTerminations: 0,
	modelCancelTerminations: 0,
	modelHealthCalls: 0,
	modelInferenceCalls: 0,
};

export function emptyCounters(): CrawlerStatsCountersV2 {
	return { ...EMPTY_COUNTERS };
}

const EMPTY_OUTCOMES: StatsOutcomeCounts = {
	success: 0,
	failure: 0,
	deferred: 0,
	cancelled: 0,
	timeout: 0,
};

export function emptyOutcomeCounts(): StatsOutcomeCounts {
	return { ...EMPTY_OUTCOMES };
}

export function emptyDiscoveryCounts(): StatsDiscoveryCounts {
	return {
		appeared: 0,
		newTracking: 0,
		existing: 0,
		rejected: 0,
		skipped: 0,
		deferred: 0,
		cancelled: 0,
		timeout: 0,
		failure: 0,
	};
}

export function emptyJobTotals(): CrawlerStatsJobTotals {
	return { completed: 0, failed: 0, deferred: 0, cancelled: 0, timeout: 0 };
}

export function emptyNetworkTotals(): CrawlerNetworkTotals {
	return {
		attempts: 0,
		transportSuccess: 0,
		transportFailure: 0,
		businessSuccess: 0,
		businessError: 0,
		rateLimited: 0,
		cancelled: 0,
		timeout: 0,
		egressResends: 0,
		sessionResends: 0,
	};
}

export function emptyMinute(from: number, to = from): StatsMinute {
	return {
		version: 2,
		from,
		to,
		counters: emptyCounters(),
		jobs: { tracking: emptyJobTotals(), discovery: emptyJobTotals() },
		network: {},
		discovery: {},
		discoveryReasons: {},
		deferrals: {},
		database: {},
		redis: {},
		distributions: {},
	};
}

export type StatsJobCounts = CrawlerStatsJobTotals;
