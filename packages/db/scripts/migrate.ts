import { loadDatabaseUrl } from "../src/databaseUrl";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { createDatabaseClient } from "../src/client";

/**
 * Applies the ordered SQL history in `drizzle/` to the catalog database.
 *
 * Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so this
 * is safe to run on every deploy. The initial migration is idempotent on
 * purpose: databases provisioned by the previous (Prisma) toolchain already
 * contain every table and adopt the Drizzle history instead of being recreated.
 */
const client = createDatabaseClient({ connectionString: loadDatabaseUrl() });

try {
	await migrate(client, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
	console.log("Catalog database migrations applied.");
} finally {
	await client.$client.close();
}
