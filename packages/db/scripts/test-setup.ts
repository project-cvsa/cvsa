import { ensureDatabase } from "@cvsa/env/database";
import { loadDatabaseUrl } from "../src/databaseUrl";

/**
 * Prisma 8's `prisma db update --yes` validates the connection before it
 * applies the contract and does not create a missing database itself (unlike
 * the docker entrypoint, which only creates `POSTGRES_DB`). Running this right
 * before the push makes `test:setup` / `test:reset` self-healing on a fresh
 * docker volume and in CI.
 */
const result = await ensureDatabase({ connection: loadDatabaseUrl() });

if (!result.created) {
	console.log(`Database "${result.database}" already exists.`);
}
