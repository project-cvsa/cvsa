import { createStatsMetrics } from "./crawler/stats/telemetry";
import { assertTaskActive } from "./crawler/shared/taskContext";
import { databaseTransaction } from "./crawler/shared/databaseContext";
import { MilestoneRepository } from "./crawler/milestone/repository";
import { MilestoneService } from "./crawler/milestone/service";
import { createMilestoneMaintenance } from "./crawler/milestone/worker";
import { AdapterProbeService } from "./crawler/network/adapterProbeService";
import { CrawlerAdminStatsService } from "./crawler/stats/adminService";
import { CrawlerStatsStateRepository } from "./crawler/stats/stateRepository";
import { createRedisHeartbeatStore } from "./crawler/stats/heartbeat";
import { crawlerExportObservation } from "./crawler/stats/exportState";
import { ResourceSampler } from "./crawler/stats/resources";
import { readQueues } from "./crawler/stats/queueState";
import type { StatsOverviewDeps } from "./crawler/stats/types";
import { DiscoveryAdminService } from "./crawler/discovery/adminService";
import { ManualSnapshotService } from "./crawler/tracking/manualSnapshot";
import {
	BilibiliClient,
	CrawlerStatsCollector,
	CrawlerStatsRepository,
	createCrawlerAdapterRegistry,
	createCrawlerMetrics,
	createCrawlerMq,
	createCrawlerRuntime,
	createNetworkMetrics,
	createRedisRateLimiter,
	createSnapshotBatchWorker,
	DiscoveryFilterService,
	DiscoveryPipelineProcessor,
	DiscoveryRepository,
	DiscoveryScheduler,
	DiscoveryService,
	VideoClassifierClient,
	SNAPSHOT_BATCH_QUEUE,
	createDiscoveryQueue,
	createDiscoveryWorker,
	type SnapshotBatchJobData,
	NetworkRuntimeConfigManager,
	NetworkRuntimeConfigRepository,
	NetworkRuntimeConfigService,
	SnapshotRepository,
	SnapshotService,
	TrackingDispatcher,
	TrackingRepository,
} from "./crawler";
import { crawlerEnv } from "@cvsa/env";
import { createCrawlerObservability } from "./observability";
import { and, asc, isNotNull, lte } from "drizzle-orm";
import { createSnapshotDb, type VideoTracking, videoTracking } from "@cvsa/snapshot-db";
import type { NetworkRateLimiter } from "@cvsa/network-scheduler";
import { MetadataRefreshScheduler } from "./controlPlane/metadataRefresh";

export const crawlerSnapshotDb = createSnapshotDb(undefined, { beforeQuery: assertTaskActive });

const statsOverviewDeps: StatsOverviewDeps = {};
export const statsHeartbeatStore = createRedisHeartbeatStore(
	crawlerEnv.REDIS_CACHE_URL ?? crawlerEnv.REDIS_URL
);
export const statsStateRepository = new CrawlerStatsStateRepository(crawlerSnapshotDb.client);

export const statsCollector = new CrawlerStatsCollector({
	metrics: createStatsMetrics(),
	overview: statsOverviewDeps,
	store: new CrawlerStatsRepository(crawlerSnapshotDb.client),
	heartbeat: statsHeartbeatStore,
});

const crawlerObservability = createCrawlerObservability(statsCollector.instanceId);

export const crawlerMq = createCrawlerMq(
	crawlerEnv.REDIS_URL,
	crawlerEnv.NODE_ENV === "test" ? `cvsa-test-${process.pid}` : "bull",
	statsCollector
);

export const trackingRepository = new TrackingRepository(crawlerSnapshotDb.client, statsCollector);
export const snapshotRepository = new SnapshotRepository(crawlerSnapshotDb.client, statsCollector);
export const milestoneRepository = new MilestoneRepository(crawlerSnapshotDb.client);
export const milestoneService = new MilestoneService(
	milestoneRepository,
	() => networkRuntime.getExecutionConfig().tracking
);
export const milestoneMaintenance = createMilestoneMaintenance(crawlerMq, milestoneService);
export const discoveryRepository = new DiscoveryRepository(
	crawlerSnapshotDb.client,
	statsCollector
);

export const snapshotQueue = crawlerMq.createQueue<SnapshotBatchJobData>(SNAPSHOT_BATCH_QUEUE);
export const manualSnapshotService = new ManualSnapshotService(
	trackingRepository,
	snapshotQueue,
	discoveryRepository
);
export const discoveryQueue = createDiscoveryQueue(crawlerMq);

export const networkRuntimeConfigRepository = new NetworkRuntimeConfigRepository(
	crawlerSnapshotDb.client
);
export const networkRuntimeConfigService = new NetworkRuntimeConfigService(
	networkRuntimeConfigRepository
);
export const crawlerAdapterRegistry = createCrawlerAdapterRegistry();
const baseRateLimiter = createRedisRateLimiter(crawlerEnv.REDIS_CACHE_URL ?? crawlerEnv.REDIS_URL);
const observedRateLimiter: NetworkRateLimiter = {
	async acquireBudgets(scope, budgets) {
		const startedAt = performance.now();
		try {
			const result = await baseRateLimiter.acquireBudgets(scope, budgets);
			statsCollector.recordRedis(
				"budget",
				"consume",
				performance.now() - startedAt,
				"success"
			);
			return result;
		} catch (error) {
			statsCollector.recordRedis(
				"budget",
				"consume",
				performance.now() - startedAt,
				"failure"
			);
			throw error;
		}
	},
	async acquire(scope, durationSeconds, maxRequests) {
		const startedAt = performance.now();
		try {
			const result = await baseRateLimiter.acquire(scope, durationSeconds, maxRequests);
			statsCollector.recordRedis(
				"budget",
				"consume",
				performance.now() - startedAt,
				"success"
			);
			return result;
		} catch (error) {
			statsCollector.recordRedis(
				"budget",
				"consume",
				performance.now() - startedAt,
				"failure"
			);
			throw error;
		}
	},
	async consume(scope, durationSeconds, maxRequests) {
		const startedAt = performance.now();
		try {
			const allowed = await baseRateLimiter.consume(scope, durationSeconds, maxRequests);
			statsCollector.recordRedis(
				"budget",
				"consume",
				performance.now() - startedAt,
				allowed ? "success" : "failure"
			);
			return allowed;
		} catch (error) {
			statsCollector.recordRedis(
				"budget",
				"consume",
				performance.now() - startedAt,
				"failure"
			);
			throw error;
		}
	},
	async remainingDelay(scope) {
		const startedAt = performance.now();
		try {
			const delay = await baseRateLimiter.remainingDelay?.(scope);
			statsCollector.recordRedis(
				"cooldown",
				"remainingDelay",
				performance.now() - startedAt,
				"success"
			);
			return delay;
		} catch (error) {
			statsCollector.recordRedis(
				"cooldown",
				"remainingDelay",
				performance.now() - startedAt,
				"failure"
			);
			throw error;
		}
	},
	async defer(scope, delayMs) {
		await baseRateLimiter.defer?.(scope, delayMs);
	},
	close: () => baseRateLimiter.close?.() ?? Promise.resolve(),
};
export const networkRuntime = new NetworkRuntimeConfigManager(
	networkRuntimeConfigRepository,
	// Bilibili application-error semantics are injected here, not in the scheduler.
	crawlerAdapterRegistry,
	observedRateLimiter,
	{
		// Every HTTP attempt lands in both OTel and the sliding-window counters.
		metrics: createNetworkMetrics({
			onRequestStarted(attributes) {
				statsCollector.recordHttpAttemptStarted(attributes);
			},
			onRequestFinishedWithAttributes(latencyMs, outcome, attributes) {
				statsCollector.recordHttpAttempt(latencyMs, outcome, attributes);
			},
		}),
	}
);

export const bilibiliClient = new BilibiliClient({
	networkDelegate: networkRuntime,
	requestTimeoutMs: () => networkRuntime.getExecutionConfig().requestTimeoutMs,
	operationTimeoutMs: () => networkRuntime.getExecutionConfig().mqOperationTimeoutMs,
	stats: statsCollector,
});

networkRuntime.onSessionChange((config) => bilibiliClient.configureSession(config));
networkRuntime.setSessionStatus(() => bilibiliClient.getSessionStatus());
export const adapterProbeService = new AdapterProbeService(
	networkRuntimeConfigService,
	bilibiliClient
);

/**
 * Consumes `video_tracking.next_metadata_at`.
 *
 * The snapshot pipeline books the next refresh after every successful sample;
 * this scheduler is what actually performs it, one row at a time, so metadata
 * stays current without an extra Redis queue.
 */
export const metadataRefreshScheduler = new MetadataRefreshScheduler({
	async listDueMetadata(now, limit) {
		const rows: VideoTracking[] = await crawlerSnapshotDb.client
			.select()
			.from(videoTracking)
			.where(
				and(isNotNull(videoTracking.nextMetadataAt), lte(videoTracking.nextMetadataAt, now))
			)
			.orderBy(asc(videoTracking.nextMetadataAt))
			.limit(limit);
		return rows;
	},
	trackingRepository,
	discoveryRepository,
	bilibiliClient,
	stats: statsCollector,
});

export const discoveryFilterService = new DiscoveryFilterService(
	{},
	// Persisting through the repository means operator edits survive restarts.
	discoveryRepository
);

/**
 * ONNX Akari classifier in a supervised local process. The inference process
 * is terminated on deadline or cancellation and restarted for subsequent work.
 */
export const videoClassifierClient = new VideoClassifierClient({
	stats: statsCollector,
	timeoutMs: () => networkRuntime.getExecutionConfig().inferenceTimeoutMs,
	onLifecycle: (event) => {
		if (event === "start") statsCollector.recordModelLifecycle("start");
		else if (event === "exit") statsCollector.recordModelLifecycle("exit");
		else if (event === "timeoutTermination")
			statsCollector.recordModelLifecycle("timeoutTermination");
		else statsCollector.recordModelLifecycle("cancelTermination");
	},
});

const resourceSampler = new ResourceSampler(
	statsCollector.instanceId,
	() => videoClassifierClient.processState().pid
);

statsOverviewDeps.queueCounts = () =>
	readQueues({
		tracking: snapshotQueue,
		discovery: discoveryQueue,
		milestones: milestoneMaintenance.queue,
	});
statsOverviewDeps.trackingState = (now) => statsStateRepository.trackingState(now);
statsOverviewDeps.labeling = (from, to) => statsStateRepository.labelingState(from, to);
statsOverviewDeps.videoCoverage = (from, to) => statsStateRepository.videoCoverage(from, to);
statsOverviewDeps.modelState = async () => {
	const [health, processState] = await Promise.all([
		videoClassifierClient.health(),
		Promise.resolve(videoClassifierClient.processState()),
	]);
	return {
		reachable: health.reachable,
		modelsLoaded: health.modelsLoaded,
		modelVersion: health.modelVersion ?? null,
		activeRequests: processState.active,
		waitingRequests: processState.waiting,
		loadFailures: statsCollector.lifetimeCounter("modelLoadFailures"),
		starts: statsCollector.lifetimeCounter("modelStarts"),
		exits: statsCollector.lifetimeCounter("modelExits"),
		timeoutTerminations: statsCollector.lifetimeCounter("modelTimeoutTerminations"),
		cancelTerminations: statsCollector.lifetimeCounter("modelCancelTerminations"),
	};
};
statsOverviewDeps.resourceState = () => resourceSampler.sample();
statsOverviewDeps.exportState = () => Promise.resolve(crawlerExportObservation.snapshot());
statsOverviewDeps.heartbeat = (instanceId) => statsHeartbeatStore.read(instanceId);
statsOverviewDeps.strategies = async () => {
	const document = await networkRuntimeConfigService.get();
	const config = document?.config;
	const hasHealth = config?.health !== undefined;
	const hasAdaptive = config?.adaptive !== undefined;
	const hasPolicies = Object.keys(config?.requestTypePolicies ?? {}).length > 0;
	const hasRateLimits = (config?.adapters ?? []).some(
		(adapter) =>
			adapter.requestsPerSecond !== undefined || (adapter.rateLimits?.length ?? 0) > 0
	);
	return [
		{
			key: "health",
			support: hasHealth ? "configured_not_wired" : "not_wired",
			configured: hasHealth,
			healthFactor: null,
			adaptiveFactor: null,
			reservedShare: null,
		},
		{
			key: "adaptive",
			support: hasAdaptive ? "configured_not_wired" : "not_wired",
			configured: hasAdaptive,
			healthFactor: null,
			adaptiveFactor: null,
			reservedShare: null,
		},
		{
			key: "requestTypePolicies",
			support: hasPolicies ? "configured_not_wired" : "not_wired",
			configured: hasPolicies,
			healthFactor: null,
			adaptiveFactor: null,
			reservedShare: null,
		},
		{
			key: "rateLimits",
			support: "active",
			configured: hasRateLimits,
			healthFactor: null,
			adaptiveFactor: null,
			reservedShare: null,
		},
		{
			key: "cooldown",
			support: "not_wired",
			configured: false,
			healthFactor: null,
			adaptiveFactor: null,
			reservedShare: null,
		},
	];
};

export const discoveryPipelineProcessor = new DiscoveryPipelineProcessor(
	bilibiliClient,
	discoveryRepository,
	trackingRepository,
	discoveryQueue,
	discoveryFilterService,
	videoClassifierClient,
	statsCollector
);
export const discoveryWorker = createDiscoveryWorker(
	crawlerMq,
	discoveryPipelineProcessor,
	12,
	statsCollector,
	() => networkRuntime.getExecutionConfig().discoveryRetry
);
export const crawlerAdminStatsService = new CrawlerAdminStatsService(
	{ tracking: snapshotQueue, discovery: discoveryQueue },
	statsCollector,
	statsOverviewDeps,
	statsStateRepository
);
export const discoveryAdminService = new DiscoveryAdminService(
	discoveryQueue,
	discoveryRepository,
	statsCollector,
	trackingRepository
);
export const discoveryScheduler = new DiscoveryScheduler(discoveryQueue);
export const discoveryService = new DiscoveryService(
	bilibiliClient,
	discoveryRepository,
	trackingRepository,
	discoveryFilterService,
	videoClassifierClient,
	statsCollector
);
export const snapshotService = new SnapshotService(
	bilibiliClient,
	snapshotRepository,
	trackingRepository,
	statsCollector,
	milestoneService,
	(work) => databaseTransaction(crawlerSnapshotDb.client, work)
);
export const snapshotBatchWorker = createSnapshotBatchWorker(
	crawlerMq,
	snapshotService,
	statsCollector
);
export const trackingDispatcher = new TrackingDispatcher(trackingRepository, crawlerMq, {
	queueCap: 200,
	leaseDurationMs: 5 * 60 * 1_000,
	stats: statsCollector,
});

networkRuntime.onExecutionChange((config) => {
	crawlerMq.setOperationTimeout?.(config.mqOperationTimeoutMs);
	snapshotBatchWorker.setTaskTimeout?.(config.taskTimeoutMs);
	discoveryWorker.setTaskTimeout?.(config.taskTimeoutMs);
	snapshotBatchWorker.setConcurrency?.(config.snapshotConcurrency);
	discoveryWorker.setConcurrency?.(config.discoveryConcurrency);
	trackingDispatcher.configure(config.queueCap, config.tracking);
	snapshotService.configure(config.tracking);
});

const baseCrawlerRuntime = createCrawlerRuntime({
	mq: crawlerMq,
	snapshotDb: crawlerSnapshotDb,
	metrics: createCrawlerMetrics(),
	networkRuntime: {
		load: () => networkRuntime.load(),
		startPolling: () => networkRuntime.startPolling(),
		stopPolling: () => networkRuntime.stopPolling(),
		async close() {
			try {
				await milestoneMaintenance.worker.close();
				await metadataRefreshScheduler.close();
			} finally {
				await bilibiliClient.stop();
				videoClassifierClient.close();
				await networkRuntime.close();
			}
		},
	},
	dispatcher: trackingDispatcher,
	worker: snapshotBatchWorker,
	discoveryWorker,
	discoveryScheduler,
	discoveryFilter: discoveryFilterService,
	statsCollector,
	observability: crawlerObservability,
});

/**
 * Adds the metadata-refresh loop to the shared crawler lifecycle.
 *
 * The loop is intentionally started after the runtime is fully connected and
 * stopped before the database/queue handles are torn down.
 */
export const crawlerRuntime = {
	async start(): Promise<void> {
		await baseCrawlerRuntime.start();
		await bilibiliClient.start();
		metadataRefreshScheduler.start();
	},
	async shutdown(): Promise<void> {
		metadataRefreshScheduler.stop();
		await baseCrawlerRuntime.shutdown();
	},
};
