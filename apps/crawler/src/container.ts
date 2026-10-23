import {
	BilibiliClient,
	createCrawlerAdapterRegistry,
	createCrawlerMetrics,
	createCrawlerMq,
	createCrawlerRuntime,
	createRedisRateLimiter,
	createSnapshotBatchWorker,
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
import { createSnapshotDb } from "@cvsa/snapshot-db";

export const crawlerSnapshotDb = createSnapshotDb();
export const crawlerMq = createCrawlerMq(crawlerEnv.REDIS_URL);
export const networkRuntimeConfigRepository = new NetworkRuntimeConfigRepository(
	crawlerSnapshotDb.client
);
export const networkRuntimeConfigService = new NetworkRuntimeConfigService(
	networkRuntimeConfigRepository
);
export const networkRuntime = new NetworkRuntimeConfigManager(
	networkRuntimeConfigRepository,
	// Bilibili application-error semantics are injected here, not in the scheduler.
	createCrawlerAdapterRegistry(),
	createRedisRateLimiter(crawlerEnv.REDIS_URL)
);

export const bilibiliClient = new BilibiliClient({
	networkDelegate: networkRuntime,
});

export const trackingRepository = new TrackingRepository(crawlerSnapshotDb.client);
export const snapshotRepository = new SnapshotRepository(crawlerSnapshotDb.client);
export const snapshotService = new SnapshotService(
	bilibiliClient,
	snapshotRepository,
	trackingRepository
);
export const snapshotBatchWorker = createSnapshotBatchWorker(crawlerMq, snapshotService);
export const trackingDispatcher = new TrackingDispatcher(trackingRepository, crawlerMq);

let otelSdk: Awaited<ReturnType<typeof initOtelSdk>> | undefined;

export const crawlerRuntime = createCrawlerRuntime({
	mq: crawlerMq,
	snapshotDb: crawlerSnapshotDb,
	metrics: createCrawlerMetrics(),
	networkRuntime,
	dispatcher: trackingDispatcher,
	worker: snapshotBatchWorker,
	observability: {
		async init(): Promise<void> {
			otelSdk = await initOtelSdk({
				serviceName: crawlerEnv.OTEL_SERVICE_NAME,
				serviceVersion: crawlerEnv.OTEL_SERVICE_VERSION,
				nodeEnv: crawlerEnv.NODE_ENV,
			});
		},
		async shutdown(): Promise<void> {
			if (otelSdk) await otelSdk.shutdown();
		},
	},
});
