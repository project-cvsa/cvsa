import { ensureDatabase } from "@cvsa/env/database";
import { crawlerEnv } from "@cvsa/env";

/**
 * The snapshot database lives in the TimescaleDB container, which only creates
 * `POSTGRES_DB` (`cvsa_snapshot`) on first boot. `cvsa_snapshot_test` therefore
 * has to be created explicitly before `prisma db update --yes`, together with
 * the TimescaleDB extension the snapshot migrations rely on.
 */
const result = await ensureDatabase({
	connection: crawlerEnv.SNAPSHOT_DATABASE_URL,
	extensions: ["timescaledb"],
});

if (!result.created) {
	console.log(`Database "${result.database}" already exists.`);
}
