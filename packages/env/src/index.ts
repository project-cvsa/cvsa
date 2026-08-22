import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.url().optional(),
		NODE_ENV: z.enum(["development", "test", "production"]).optional(),
		MEILI_MASTER_KEY: z.string().optional().default(""),
		MEILI_API_URL: z.url().optional().default("http://127.0.0.1:7700"),

		OTEL_SERVICE_NAME: z.string().optional().default("cvsa-backend"),
		OTEL_SERVICE_VERSION: z.string().optional().default("0.0.0"),

		LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).optional().default("info"),

		REDIS_URL: z.string().optional().default("redis://127.0.0.1:6379"),

		COOKIE_DOMAIN: z.string().optional(),
		BETTER_AUTH_SECRET: z.string().optional(),
		BETTER_AUTH_URL: z.url().optional(),
		WEB_ORIGINS: z.string().optional(),
	},

	runtimeEnv: import.meta.env,

	emptyStringAsUndefined: true,
});

/** Configuration used by the crawler process without requiring primary DB settings. */
export const crawlerEnv = createEnv({
	server: {
		NODE_ENV: z.enum(["development", "test", "production"]).optional(),
		REDIS_URL: z.url().default("redis://127.0.0.1:6379"),
		SNAPSHOT_DATABASE_URL: z
			.url()
			.default("postgres://cvsa:password@127.0.0.1:5433/cvsa_snapshot"),
		LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
		OTEL_SERVICE_NAME: z.string().default("cvsa-crawler"),
		OTEL_SERVICE_VERSION: z.string().default("0.0.0"),
		CONTROL_API_HOST: z.string().default("127.0.0.1"),
		CONTROL_API_PORT: z.coerce.number().int().min(1).max(65_535).default(16_413),
		CONTROL_API_TOKEN: z.string().min(1).optional(),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
