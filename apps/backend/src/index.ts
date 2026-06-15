<<<<<<< HEAD
import { Elysia, type ErrorHandler } from "elysia";
import { onAfterHandler } from "./onAfterHandle";
import { getBindingInfo, logStartup } from "./startMessage";
import pkg from "../package.json";
import { authHandler } from "@routes/auth";
import { AppError } from "@lib/error";
import { ZodError } from "zod";

const [host, port] = getBindingInfo();
logStartup(host, port);

const errorHandler: ErrorHandler<{
	readonly AppError: AppError;
}> = ({ code, status, error }) => {
	if (code === "NOT_FOUND")
		return status(404, {
			message: "The requested resource was not found.",
		});
	if (code === "VALIDATION") {
		const detail = error.detail(error.message);
		if (typeof detail === "string") {
			return status(422, {
				code: "VALIDATION_ERROR",
				message: detail,
			});
		}
		return status(422, {
			code: "VALIDATION_ERROR",
			message: detail.summary,
		});
	}
	if (error instanceof AppError) {
		return status(error.statusCode, {
			code: error.code,
			message: error.message,
		});
	}
	if (error instanceof ZodError) {
		return status(422, {
			code: "VALIDATION_ERROR",
			message: error.message,
		});
	}
	return status(500, {
		code: "SERVER_ERROR",
		message: "Internal server error",
	});
};
=======
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
>>>>>>> origin/develop

export const app = new Elysia({
	serve: {
		hostname: host,
	},
	prefix: "/v2",
})
<<<<<<< HEAD
	.error({
		AppError,
	})
	.onError(errorHandler)
	.use(authHandler)
	.use(onAfterHandler)
=======
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
	.use(artistRoleHandler)
	.use(singerHandler)
	.use(devHandler)
>>>>>>> origin/develop
	.listen(16412);

export const VERSION = pkg.version;

export type App = typeof app;
