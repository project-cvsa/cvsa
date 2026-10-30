import { defineConfig } from "drizzle-kit";
import { crawlerEnv } from "@cvsa/env";

/**
 * Schema source of truth for the crawler's TimescaleDB database.
 *
 * `push` provisions development and test databases directly from the Drizzle
 * schema; `migrate:deploy` applies the checked-in SQL under `./drizzle` so
 * production rolls forward through the same ordered history as CI.
 */
export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./drizzle",
	dbCredentials: {
		url: crawlerEnv.SNAPSHOT_DATABASE_URL,
	},
	// `push` diffs the whole server, and TimescaleDB keeps its catalogs in
	// `_timescaledb_*` schemas. Without this filter it would offer to drop them.
	schemaFilter: ["public"],
	verbose: true,
});
