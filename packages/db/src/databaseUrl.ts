import { existsSync } from "node:fs";

/** Matches the Drizzle config default when `DATABASE_URL` is not configured. */
const DEFAULT_DATABASE_URL = "postgresql://cvsa:password@localhost:5432/cvsa";

/**
 * Loads `.env` (or `.env.test`) and returns the primary database connection
 * string.
 *
 * `drizzle.config.ts` and the standalone setup scripts run as separate
 * processes, so they share this helper instead of each parsing the environment
 * on its own and silently targeting different databases.
 */
export function loadDatabaseUrl(): string {
	const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";

	if (existsSync(envFile)) {
		process.loadEnvFile(envFile);
	}

	return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}
