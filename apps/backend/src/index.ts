import { Elysia } from "elysia";
import { onAfterHandler } from "./onAfterHandle";
import { getBindingInfo, logStartup } from "./startMessage";
import pkg from "../package.json";
import {
	authHandler,
	songHandler,
	engineHandler,
	artistHandler,
	artistRoleHandler,
	singerHandler,
} from "@handlers/index";
import { errorHandler } from "./errorHandler";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
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

const corsOriginPatterns = [
	/^https?:\/\/([a-z0-9-]+\.)*projectcvsa\.com(?::\d+)?$/,
	/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/,
];

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
	.use(
		cors({
			origin: corsOriginPatterns,
			methods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowedHeaders: ["content-type", "x-locale", "authorization"],
			credentials: true,
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
	.use(artistRoleHandler)
	.use(singerHandler)
	.use(devHandler);

if (process.env.NODE_ENV !== "test") {
	app.listen(16412);
}

export const VERSION = pkg.version;

export type App = typeof app;
