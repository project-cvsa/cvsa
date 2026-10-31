import { assertTaskActive } from "./crawler/shared/taskContext";
import { AdapterProbeService } from "./crawler/network/adapterProbeService";
import { CrawlerAdminStatsService } from "./crawler/stats/adminService";
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
import { initOtelSdk } from "@cvsa/observability";
import { and, asc, isNotNull, lte } from "drizzle-orm";
import { createSnapshotDb, type VideoTracking, videoTracking } from "@cvsa/snapshot-db";
import { MetadataRefreshScheduler } from "./controlPlane/metadataRefresh";

export const crawlerSnapshotDb = createSnapshotDb(undefined, { beforeQuery: assertTaskActive });
export const crawlerMq = createCrawlerMq(
	crawlerEnv.REDIS_URL,
	crawlerEnv.NODE_ENV === "test" ? `cvsa-test-${process.pid}` : "bull"
);

export const trackingRepository = new TrackingRepository(crawlerSnapshotDb.client);
export const snapshotRepository = new SnapshotRepository(crawlerSnapshotDb.client);
export const discoveryRepository = new DiscoveryRepository(crawlerSnapshotDb.client);

export const snapshotQueue = crawlerMq.createQueue<SnapshotBatchJobData>(SNAPSHOT_BATCH_QUEUE);
export const manualSnapshotService = new ManualSnapshotService(
	trackingRepository,
	snapshotQueue,
	discoveryRepository
);
export const discoveryQueue = createDiscoveryQueue(crawlerMq);

/**
 * Sliding-window stats + the `crawler_stats_rollup` history.
 *
 * Queue depth and the tracking backlog are pulled lazily by the overview
 * endpoint, so the collector itself stays a pure in-memory counter.
 */
export const statsCollector = new CrawlerStatsCollector({
	overview: {
		async queueCounts() {
			const [snapshot, discovery] = await Promise.all([
				snapshotQueue.getJobCounts(),
				discoveryQueue.getJobCounts(),
			]);
			return [snapshot, discovery];
		},
		countOverdue(now) {
			return trackingRepository.countOverdueVideos(now);
		},
	},
	rollup: new CrawlerStatsRepository(crawlerSnapshotDb.client),
});

export const networkRuntimeConfigRepository = new NetworkRuntimeConfigRepository(
	crawlerSnapshotDb.client
);
export const networkRuntimeConfigService = new NetworkRuntimeConfigService(
	networkRuntimeConfigRepository
);
export const crawlerAdapterRegistry = createCrawlerAdapterRegistry();
export const networkRuntime = new NetworkRuntimeConfigManager(
	networkRuntimeConfigRepository,
	// Bilibili application-error semantics are injected here, not in the scheduler.
	crawlerAdapterRegistry,
	createRedisRateLimiter(crawlerEnv.REDIS_CACHE_URL ?? crawlerEnv.REDIS_URL),
	{
		// Every HTTP attempt lands in both OTel and the sliding-window counters.
		metrics: createNetworkMetrics({
			onRequestFinished(latencyMs, outcome) {
				statsCollector.recordNetworkRequest(latencyMs, outcome);
			},
		}),
	}
);

export const bilibiliClient = new BilibiliClient({
	networkDelegate: networkRuntime,
	requestTimeoutMs: () => networkRuntime.getExecutionConfig().requestTimeoutMs,
	operationTimeoutMs: () => networkRuntime.getExecutionConfig().mqOperationTimeoutMs,
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
	timeoutMs: () => networkRuntime.getExecutionConfig().inferenceTimeoutMs,
});

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
	statsCollector
);
export const crawlerAdminStatsService = new CrawlerAdminStatsService(
	{ tracking: snapshotQueue, discovery: discoveryQueue },
	statsCollector
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
	statsCollector
);
export const snapshotBatchWorker = createSnapshotBatchWorker(
	crawlerMq,
	snapshotService,
	statsCollector
);
export const trackingDispatcher = new TrackingDispatcher(trackingRepository, crawlerMq, {
	queueCap: 200,
	remainingDelay: () => networkRuntime.remainingDelay(),
	leaseDurationMs: 5 * 60 * 1_000,
});

networkRuntime.onExecutionChange((config) => {
	crawlerMq.setOperationTimeout?.(config.mqOperationTimeoutMs);
	snapshotBatchWorker.setTaskTimeout?.(config.taskTimeoutMs);
	discoveryWorker.setTaskTimeout?.(config.taskTimeoutMs);
	snapshotBatchWorker.setConcurrency?.(config.snapshotConcurrency);
	discoveryWorker.setConcurrency?.(config.discoveryConcurrency);
	trackingDispatcher.configure(config.queueCap);
});

let otelSdk: Awaited<ReturnType<typeof initOtelSdk>> | undefined;

const baseCrawlerRuntime = createCrawlerRuntime({
	mq: crawlerMq,
	snapshotDb: crawlerSnapshotDb,
	metrics: createCrawlerMetrics(),
	networkRuntime,
	dispatcher: trackingDispatcher,
	worker: snapshotBatchWorker,
	discoveryWorker,
	discoveryScheduler,
	discoveryFilter: discoveryFilterService,
	statsCollector,
	observability: {
		async init(): Promise<void> {
			otelSdk = await initOtelSdk({
				serviceName: crawlerEnv.OTEL_SERVICE_NAME,
				serviceVersion: crawlerEnv.OTEL_SERVICE_VERSION,
				nodeEnv: crawlerEnv.NODE_ENV,
				otlpEndpoint: crawlerEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
			});
		},
		async shutdown(): Promise<void> {
			if (otelSdk) await otelSdk.shutdown();
		},
	},
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
		await bilibiliClient.stop();
		videoClassifierClient.close();
	},
};
