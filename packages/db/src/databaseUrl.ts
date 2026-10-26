import { existsSync } from "node:fs";

/** Matches the Prisma CLI default when `DATABASE_URL` is not configured. */
const DEFAULT_DATABASE_URL = "postgresql://localhost:5432/cvsa";

/**
 * Loads the same `.env` / `.env.test` file the Prisma CLI uses and returns the
 * primary database connection string.
 *
 * Prisma reads the file from `prisma.config.ts` itself, while the test setup
 * script runs as a separate process. Sharing this helper keeps both from
 * drifting apart and silently targeting different databases.
 */
export function loadDatabaseUrl(): string {
	const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";

	if (existsSync(envFile)) {
		process.loadEnvFile(envFile);
	}

	return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}
