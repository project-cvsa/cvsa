import {
	createCrawlerMq,
	createCrawlerMetrics,
	createCrawlerRuntime,
	type CrawlerRuntime,
} from "@cvsa/core/crawler";
import { crawlerEnv } from "@cvsa/env";
import { createApplicationLogger, createPinoLogger } from "@cvsa/logger";
import { createOtelLogger, initOtelSdk } from "@cvsa/observability";
import { createSnapshotDb } from "@cvsa/snapshot-db";

export function createCrawlerAppRuntime(): CrawlerRuntime {
	const logger = createApplicationLogger(
		createPinoLogger({ level: crawlerEnv.CRAWLER_LOG_LEVEL, nodeEnv: crawlerEnv.NODE_ENV }),
		createOtelLogger(crawlerEnv.CRAWLER_OTEL_SERVICE_NAME)
	);
	const snapshotDb = createSnapshotDb();
	const mq = createCrawlerMq(crawlerEnv.CRAWLER_REDIS_URL, logger);
	let otelSdk: Awaited<ReturnType<typeof initOtelSdk>> | undefined;

	return createCrawlerRuntime({
		logger,
		mq,
		snapshotDb,
		metrics: createCrawlerMetrics(),
		observability: {
			async init(): Promise<void> {
				otelSdk = await initOtelSdk({
					serviceName: crawlerEnv.CRAWLER_OTEL_SERVICE_NAME,
					serviceVersion: crawlerEnv.CRAWLER_OTEL_SERVICE_VERSION,
					nodeEnv: crawlerEnv.NODE_ENV,
				});
			},
			async shutdown(): Promise<void> {
				if (otelSdk) await otelSdk.shutdown();
			},
		},
	});
}

async function main(): Promise<void> {
	const runtime = createCrawlerAppRuntime();
	let shuttingDown = false;

	const shutdown = async (signal: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		const logger = createApplicationLogger(
			createPinoLogger({ level: crawlerEnv.CRAWLER_LOG_LEVEL, nodeEnv: crawlerEnv.NODE_ENV }),
			createOtelLogger(crawlerEnv.CRAWLER_OTEL_SERVICE_NAME)
		);
		logger.info(`Received ${signal}, shutting down crawler gracefully`, {
			component: "crawler-runtime",
			signal,
		});
		await runtime.shutdown();
	};

	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));

	await runtime.start();
	await new Promise<void>(() => {});
}

if (import.meta.main) {
	await main();
}
