import { ensureDatabase } from "@cvsa/env/database";
import { crawlerEnv } from "@cvsa/env";
import { SQL } from "bun";

/**
 * The snapshot database lives in the TimescaleDB container, which only creates
 * `POSTGRES_DB` (`cvsa_snapshot`) on first boot. `cvsa_snapshot_test` therefore
 * has to be created explicitly before `drizzle-kit push`, together with
 * TimescaleDB and the auxiliary extensions schema (`pg_stat_statements`,
 * `pg_trgm`) so `drizzle-kit`'s `schemaFilter: ["public"]` never drops extension
 * views while unqualified queries and `gin_trgm_ops` indexes resolve via `search_path`.
 */
const result = await ensureDatabase({
	connection: crawlerEnv.SNAPSHOT_DATABASE_URL,
	extensions: ["timescaledb"],
});

const sql = new SQL({ max: 1, url: crawlerEnv.SNAPSHOT_DATABASE_URL });
try {
	await sql.unsafe(`
		CREATE SCHEMA IF NOT EXISTS "extensions";
		GRANT USAGE ON SCHEMA "extensions" TO PUBLIC;
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
				ALTER EXTENSION "pg_stat_statements" SET SCHEMA "extensions";
			ELSE
				CREATE EXTENSION "pg_stat_statements" WITH SCHEMA "extensions";
			END IF;
			IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
				ALTER EXTENSION "pg_trgm" SET SCHEMA "extensions";
			ELSE
				CREATE EXTENSION "pg_trgm" WITH SCHEMA "extensions";
			END IF;
			EXECUTE format('ALTER DATABASE %I SET search_path TO "$user", public, extensions', current_database());
		END $$;
	`);
} finally {
	await sql.close();
}

if (!result.created) {
	console.log(`Database "${result.database}" already exists.`);
}
