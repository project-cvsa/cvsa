import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { crawlerEnv } from "@cvsa/env";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { createDatabaseClient } from "../src/client";

/**
 * Applies the ordered SQL history in `drizzle/` to the snapshot database.
 *
 * Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so this
 * is safe to run on every deploy. The first migration is idempotent on purpose:
 * databases provisioned by the previous (Prisma) toolchain already contain every
 * table and adopt the Drizzle history instead of being recreated.
 */
const client = createDatabaseClient({
	connectionString: crawlerEnv.SNAPSHOT_DATABASE_URL,
	idleTimeout: 0,
});

const bundledMigrations = resolve(import.meta.dirname, "drizzle");
const migrationsFolder =
	process.env.MIGRATIONS_FOLDER ??
	(existsSync(bundledMigrations)
		? bundledMigrations
		: resolve(import.meta.dirname, "../drizzle"));

try {
	await migrate(client, { migrationsFolder });
	console.log("Snapshot database migrations applied.");
} finally {
	await client.$client.close();
}
