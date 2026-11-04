import { traceTask } from "@cvsa/observability";
import { appLogger } from "@cvsa/logger";
import type { CrawlerRuntimeDependencies } from "./shared/types";

export interface CrawlerRuntime {
	start(): Promise<void>;
	shutdown(): Promise<void>;
}

export function createCrawlerRuntime(deps: CrawlerRuntimeDependencies): CrawlerRuntime {
	let started = false;
	let shutdownComplete = false;
	const shutdown = async (): Promise<void> => {
		if (shutdownComplete) return;
		shutdownComplete = true;
		try {
			await traceTask("crawler.runtime.shutdown", async () => {
				deps.dispatcher?.stop();
				deps.statsCollector?.stopPeriodicFlush();
				if (deps.discoveryWorker) await deps.discoveryWorker.close();
				if (deps.worker) await deps.worker.close();
				if (deps.networkRuntime?.close) await deps.networkRuntime.close();
				else deps.networkRuntime?.stopPolling();
				// Closing the MQ drains work whose deadline already rejected, so the
				// final statistics write includes everything those jobs recorded.
				await deps.mq.close();
				try {
					if (deps.statsCollector?.close) await deps.statsCollector.close();
					else await deps.statsCollector?.flush?.();
				} finally {
					await deps.snapshotDb.disconnect();
					deps.metrics?.runtimeShutdowns.add(1);
				}
			});
		} finally {
			await deps.observability.shutdown();
		}
		appLogger.info("Crawler runtime shut down", { component: "crawler-runtime" });
	};

	return {
		async start(): Promise<void> {
			if (started) return;

			try {
				await deps.observability.init();
				await traceTask("crawler.runtime.start", async () => {
					await deps.snapshotDb.connect();
					await deps.snapshotDb.healthCheck();
					await deps.mq.connect();
					// Operator-tuned filter config lives in the database, so it must be
					// restored before the first discovery job is consumed.
					await deps.discoveryFilter?.initialize();
					await deps.networkRuntime?.load();
					deps.networkRuntime?.startPolling();
					deps.statsCollector?.startPeriodicFlush();
					deps.dispatcher?.start();
					if (deps.discoveryScheduler) {
						await deps.discoveryScheduler.startScheduledSweeps();
					}
				});
				started = true;
				deps.metrics?.runtimeStarts.add(1);
				appLogger.info("Crawler runtime started", { component: "crawler-runtime" });
			} catch (error) {
				deps.metrics?.dependencyFailures.add(1);
				appLogger.error("Crawler runtime failed to start", {
					component: "crawler-runtime",
					error,
				});
				await shutdown();
				throw error;
			}
		},

		shutdown,
	};
}
