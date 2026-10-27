import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import { crawlerControlPlane } from "./controlPlane";
import { crawlerRuntime } from "./container";

async function main(): Promise<void> {
	if (!crawlerEnv.CONTROL_API_TOKEN) {
		throw new Error("CONTROL_API_TOKEN must be configured before starting crawler");
	}

	let shuttingDown = false;

	let resolveExit: () => void;
	const exitPromise = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});

	const shutdown = async (signal: string): Promise<void> => {
		if (shuttingDown) return;
		shuttingDown = true;
		try {
			crawlerControlPlane.stop();
			appLogger.info(`Received ${signal}, shutting down crawler gracefully`, {
				component: "crawler-runtime",
				signal,
			});
			await crawlerRuntime.shutdown();
		} catch (error) {
			appLogger.error(
				`Error during crawler shutdown: ${error instanceof Error ? error.message : String(error)}`,
				{
					component: "crawler-runtime",
					signal,
				}
			);
			process.exit(1);
		} finally {
			resolveExit();
		}
	};

	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));

	await crawlerRuntime.start();
	crawlerControlPlane.listen({
		hostname: crawlerEnv.CONTROL_API_HOST,
		port: crawlerEnv.CONTROL_API_PORT,
	});
	await exitPromise;
	process.exit(0);
}

if (import.meta.main) {
	await main();
}
