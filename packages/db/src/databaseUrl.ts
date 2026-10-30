import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Matches the Drizzle config default when `DATABASE_URL` is not configured. */
const DEFAULT_DATABASE_URL = "postgresql://cvsa:password@localhost:5432/cvsa";

/**
 * Returns the primary database connection string.
 *
 * `drizzle-kit` preloads `.env` before reading the config, so
 * `process.loadEnvFile(".env.test")` cannot replace the development
 * `DATABASE_URL`. Test mode therefore reads `.env.test` directly; outside tests
 * an explicitly configured `DATABASE_URL` still wins over `.env`.
 */
export function loadDatabaseUrl(): string {
	const test = process.env.NODE_ENV === "test";
	const envFile = test ? ".env.test" : ".env";
	const fromFile = existsSync(envFile)
		? parseEnv(readFileSync(envFile, "utf8")).DATABASE_URL
		: undefined;

	if (test) return fromFile ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	return process.env.DATABASE_URL ?? fromFile ?? DEFAULT_DATABASE_URL;
}
