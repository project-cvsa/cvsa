import { env } from "@cvsa/env";
import { createDatabaseClient } from "./client";
import { loadDatabaseUrl } from "./databaseUrl";

export * from "./client";
export * from "./relations";
export * from "./schema";
export * from "./serialize";
export * from "./types";

/**
 * Shared catalog client.
 *
 * The connection string resolution is deliberate: `env` validates the process
 * environment, but scripts and tests can run without it fully populated, so the
 * `.env` file is the fallback.
 */
export const db = createDatabaseClient({
	connectionString:
		env.DATABASE_URL ??
		(typeof process !== "undefined"
			? (process.env.DATABASE_URL ?? loadDatabaseUrl())
			: undefined),
});
