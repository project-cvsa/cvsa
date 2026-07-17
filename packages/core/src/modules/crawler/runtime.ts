import { traceTask } from "@cvsa/observability";
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
		await traceTask("crawler.runtime.shutdown", async () => {
			await deps.mq.close();
			await deps.snapshotDb.disconnect();
			await deps.observability.shutdown();
		});
		deps.metrics?.runtimeShutdowns.add(1);
		deps.logger.info("Crawler runtime shut down", { component: "crawler-runtime" });
	};

	return {
		async start(): Promise<void> {
			if (started) return;

			try {
				await traceTask("crawler.runtime.start", async () => {
					await deps.observability.init();
					await deps.snapshotDb.connect();
					await deps.snapshotDb.healthCheck();
					await deps.mq.connect();
				});
				started = true;
				deps.metrics?.runtimeStarts.add(1);
				deps.logger.info("Crawler runtime started", { component: "crawler-runtime" });
			} catch (error) {
				deps.metrics?.dependencyFailures.add(1);
				deps.logger.error("Crawler runtime failed to start", {
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
