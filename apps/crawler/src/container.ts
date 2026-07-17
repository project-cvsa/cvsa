import {
	AdapterRegistry,
	createCrawlerMetrics,
	createCrawlerMq,
	createCrawlerRuntime,
	createRedisRateLimiter,
	NetworkRuntimeConfigManager,
	NetworkRuntimeConfigRepository,
	NetworkRuntimeConfigService,
} from "@cvsa/core/crawler";
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
	new AdapterRegistry(),
	createRedisRateLimiter(crawlerEnv.REDIS_URL)
);

let otelSdk: Awaited<ReturnType<typeof initOtelSdk>> | undefined;

export const crawlerRuntime = createCrawlerRuntime({
	mq: crawlerMq,
	snapshotDb: crawlerSnapshotDb,
	metrics: createCrawlerMetrics(),
	networkRuntime,
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
