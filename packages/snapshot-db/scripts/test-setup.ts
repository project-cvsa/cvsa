import { crawlerEnv } from "@cvsa/env";
import { ensureDatabase } from "@cvsa/env/database";
import { SQL } from "bun";
import { EXTENSION_STATEMENTS } from "./extensions";

/**
 * The snapshot database lives in the TimescaleDB container, which only creates
 * `POSTGRES_DB` (`cvsa_snapshot`) on first boot. `cvsa_snapshot_test` therefore
 * has to be created explicitly before `drizzle-kit push`, together with
 * TimescaleDB and the auxiliary extensions schema (`pg_stat_statements`,
 * `pg_trgm`).
 */
const result = await ensureDatabase({
	connection: crawlerEnv.SNAPSHOT_DATABASE_URL,
	extensions: ["timescaledb"],
});

const sql = new SQL({ max: 1, url: crawlerEnv.SNAPSHOT_DATABASE_URL });
try {
	for (const statement of EXTENSION_STATEMENTS) {
		await sql.unsafe(statement);
	}
} finally {
	await sql.close();
}

if (!result.created) {
	console.log(`Database "${result.database}" already exists.`);
}
