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
	crawlerAdminHandler,
} from "@handlers/index";
import { errorHandler } from "./errorHandler";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { requestLoggerMiddleware } from "@/middlewares";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { devHandler } from "./handlers";
import {
	createOutboxWorker,
	closeOutboxInfrastructure,
	processOutboxEntry,
	outboxService,
} from "./outbox";
import { appLogger } from "@cvsa/logger";
import { env } from "@cvsa/env";

const [host, port] = getBindingInfo();

logStartup(host, port);

/**
 * Origins that are always trusted: the project's own domains in any
 * subdomain/scheme/port, plus local development.
 */
const BASE_CORS_ORIGIN_PATTERNS = [
	/^https?:\/\/([a-z0-9-]+\.)*projectcvsa\.com(?::\d+)?$/,
	/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/,
];

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert one deployment-configured origin into a CORS allow pattern. An entry
 * may be a full origin (`https://cvsa.example.com`) or a bare host, which is
 * how `SITE_ADDRESS` configures the public hostname. Either scheme and an
 * optional port are accepted because the same stack runs behind plain HTTP in
 * staging.
 */
function toCorsOriginPattern(entry: string): RegExp | undefined {
	const value = entry.trim().replace(/\/+$/, "");
	if (value.length === 0) {
		return undefined;
	}
	const host = value.replace(/^https?:\/\//, "");
	return new RegExp(`^https?://${escapeRegExp(host)}(?::\\d+)?$`);
}

/**
 * Every domain configured for this deployment (`WEB_ORIGINS`, comma-separated,
 * or the single public `SITE_ADDRESS`) is allowed automatically, so pointing
 * the stack at a new host needs no code change.
 */
const CONFIGURED_CORS_ORIGIN_PATTERNS = [process.env.WEB_ORIGINS, process.env.SITE_ADDRESS]
	.flatMap((value) => value?.split(",") ?? [])
	.map(toCorsOriginPattern)
	.filter((pattern) => pattern !== undefined);

const corsOriginPatterns = [...BASE_CORS_ORIGIN_PATTERNS, ...CONFIGURED_CORS_ORIGIN_PATTERNS];

const outboxWorker = createOutboxWorker(processOutboxEntry);

const drainPendingOutbox = () => {
	outboxService.recoverStaleEntries().catch((e) => {
		appLogger.warn(`Failed to recover stale outbox entries: ${e.message}`);
	});
};

drainPendingOutbox();
const outboxPollTimer =
	process.env.NODE_ENV !== "test" ? setInterval(drainPendingOutbox, 5_000) : undefined;

process.on("SIGTERM", async () => {
	appLogger.info("Received SIGTERM, shutting down gracefully...");
	if (outboxPollTimer) clearInterval(outboxPollTimer);
	await outboxWorker.close();
	await closeOutboxInfrastructure();
	process.exit(0);
});

process.on("SIGINT", async () => {
	appLogger.info("Received SIGINT, shutting down gracefully...");
	if (outboxPollTimer) clearInterval(outboxPollTimer);
	await outboxWorker.close();
	await closeOutboxInfrastructure();
	process.exit(0);
});

/**
 * Request tracing is always installed because it produces the span — and the
 * trace id — that logging and error reporting key on. Only the OTLP exporter is
 * opt-in: without a configured collector, exporting would just buffer and retry
 * against 127.0.0.1:4317.
 */
const telemetry = opentelemetry({
	spanProcessors:
		env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined
			? [new BatchSpanProcessor(new OTLPTraceExporter())]
			: [],
});

export const app = new Elysia({
	serve: {
		hostname: host,
	},
	prefix: "/v2",
})
	.use(telemetry)
	.use(
		cors({
			origin: corsOriginPatterns,
			methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["content-type", "x-locale", "authorization", "accept-language"],
			exposeHeaders: ["x-trace-id", "X-Trace-ID"],
			credentials: true,
		})
	)
	.use(onAfterHandler)
	.use(requestLoggerMiddleware)
	.use(errorHandler)
	.use(openapi())
	.get("/health", () => ({ status: "ok", version: pkg.version }))
	.use(authHandler)
	.use(songHandler)
	.use(engineHandler)
	.use(artistHandler)
	.use(artistRoleHandler)
	.use(singerHandler)
	.use(devHandler)
	.use(crawlerAdminHandler);

if (process.env.NODE_ENV !== "test") {
	app.listen({ hostname: host, port });
}

export const VERSION = pkg.version;

export type App = typeof app;
