import { Elysia } from "elysia";
import { onAfterHandler } from "./onAfterHandle";
import { getBindingInfo, logStartup } from "./startMessage";
import pkg from "../package.json";
import {
	authHandler,
	songHandler,
	engineHandler,
	artistHandler,
	singerHandler,
} from "@handlers/index";
import { errorHandler } from "./errorHandler";
import { openapi } from "@elysiajs/openapi";
import { requestLoggerMiddleware } from "@/middlewares";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { devHandler } from "./handlers";
import { createOutboxWorker, closeOutboxInfrastructure } from "@cvsa/core";
import { processOutboxEntry } from "@cvsa/core";
import { outboxService } from "@cvsa/core";
import { appLogger } from "@cvsa/logger";

const [host, port] = getBindingInfo();

logStartup(host, port);

const outboxWorker = createOutboxWorker(processOutboxEntry);

outboxService.recoverStaleEntries().catch((e) => {
	appLogger.warn(`Failed to recover stale outbox entries: ${e.message}`);
});

process.on("SIGTERM", async () => {
	appLogger.info("Received SIGTERM, shutting down gracefully...");
	await outboxWorker.close();
	await closeOutboxInfrastructure();
	process.exit(0);
});

process.on("SIGINT", async () => {
	appLogger.info("Received SIGINT, shutting down gracefully...");
	await outboxWorker.close();
	await closeOutboxInfrastructure();
	process.exit(0);
});

export const app = new Elysia({
	serve: {
		hostname: host,
	},
	prefix: "/v2",
})
	.use(
		opentelemetry({
			spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
		})
	)
	.use(onAfterHandler)
	.use(requestLoggerMiddleware)
	.use(errorHandler)
	.use(openapi())
	.use(authHandler)
	.use(songHandler)
	.use(engineHandler)
	.use(artistHandler)
	.use(singerHandler)
	.use(devHandler)
	.listen(16412);

export const VERSION = pkg.version;

export type App = typeof app;
