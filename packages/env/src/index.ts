import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const runtimeEnvironment = {
	...process.env,
	...(typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}),
};

export const env = createEnv({
	server: {
		HOST: z.string().optional(),
		PORT: z.coerce.number().int().min(1).max(65_535).optional().default(16_412),
		DATABASE_URL: z.url().optional(),
		NODE_ENV: z.enum(["development", "test", "production"]).optional(),
		MEILI_MASTER_KEY: z.string().optional().default(""),
		MEILI_API_URL: z.url().optional().default("http://127.0.0.1:7700"),

		OTEL_SERVICE_NAME: z.string().optional().default("cvsa-backend"),
		OTEL_SERVICE_VERSION: z.string().optional().default("0.0.0"),
		/** Collector endpoint. When unset, tracing is disabled entirely. */
		OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),

		LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).optional().default("info"),

		REDIS_URL: z.string().optional().default("redis://127.0.0.1:6379"),

		/** Embedding service used by search indexing. */
		EMBEDDING_API_URL: z.url().optional().default("http://127.0.0.1:14900"),

		COOKIE_DOMAIN: z.string().optional(),
		BETTER_AUTH_SECRET: z.string().optional(),
		BETTER_AUTH_URL: z.url().optional(),
		WEB_ORIGINS: z.string().optional(),
	},

	runtimeEnv: runtimeEnvironment,

	emptyStringAsUndefined: true,
});

/**
 * The snapshot database has a development and a test instance on the same
 * docker-compose service. Deriving the default from `NODE_ENV` keeps every
 * consumer — the crawler daemon, the crawler's own tests, and any test that
 * builds a `SnapshotDb` — off local development data without each package
 * restating the URL. An explicit `SNAPSHOT_DATABASE_URL` still wins.
 */
const SNAPSHOT_DATABASE_URL_DEFAULT =
	process.env.NODE_ENV === "test"
		? "postgres://cvsa:password@127.0.0.1:5433/cvsa_snapshot_test"
		: "postgres://cvsa:password@127.0.0.1:5433/cvsa_snapshot";

/** Configuration used by the crawler process without requiring primary DB settings. */
export const crawlerEnv = createEnv({
	server: {
		NODE_ENV: z.enum(["development", "test", "production"]).optional(),
		REDIS_URL: z.url().default("redis://127.0.0.1:6379"),
		SNAPSHOT_DATABASE_URL: z.url().default(SNAPSHOT_DATABASE_URL_DEFAULT),
		LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
		OTEL_SERVICE_NAME: z.string().default("cvsa-crawler"),
		OTEL_SERVICE_VERSION: z.string().default("0.0.0"),
		CONTROL_API_HOST: z.string().default("127.0.0.1"),
		CONTROL_API_PORT: z.coerce.number().int().min(1).max(65_535).default(16_413),
		CONTROL_API_URL: z.url().optional(),
		CONTROL_API_TOKEN: z.string().min(1).optional(),
		/**
		 * Directory holding the in-process ONNX classifier artifacts:
		 * `<dir>/embedding/model.onnx` and `<dir>/akari/<version>.onnx`.
		 * Defaults to `./model` relative to the crawler's working directory.
		 * The tokenizer is fetched from HuggingFace, not from this directory.
		 */
		CRAWLER_MODEL_DIR: z.string().min(1).optional(),
	},
	runtimeEnv: runtimeEnvironment,
	emptyStringAsUndefined: true,
});
