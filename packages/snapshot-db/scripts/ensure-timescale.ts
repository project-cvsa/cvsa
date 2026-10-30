import { crawlerEnv } from "@cvsa/env";
import { SQL } from "bun";

/**
 * TimescaleDB is not expressible in the Drizzle schema document: both
 * `drizzle-kit push` and `migrate:deploy` create `video_snapshot` as an ordinary
 * Postgres table. This script upgrades that table in place, so every path that
 * provisions the snapshot database ends up with the same hypertable.
 *
 * It deliberately runs outside the migration graph. A database bootstrapped
 * with `drizzle-kit push` never replays the SQL history, so a migration-only
 * hook would never reach that database.
 *
 * Every statement is idempotent, so `migrate:deploy` is safe to re-run — and
 * safe on top of a database `db:update` already prepared.
 */
const TIMESCALE_STATEMENTS = [
	"CREATE EXTENSION IF NOT EXISTS timescaledb",
	"SELECT create_hypertable('video_snapshot', 'captured_at', if_not_exists => TRUE)",
	`ALTER TABLE "video_snapshot" SET (
		timescaledb.compress,
		timescaledb.compress_segmentby = 'aid',
		timescaledb.compress_orderby = 'captured_at DESC'
	)`,
	"SELECT add_compression_policy('video_snapshot', INTERVAL '7 days', if_not_exists => TRUE)",
	"SELECT remove_retention_policy('video_snapshot', if_exists => TRUE)",
] as const;

interface HypertableState {
	compression_enabled: boolean;
	compression_policy: boolean;
}

const sql = new SQL({ max: 1, url: crawlerEnv.SNAPSHOT_DATABASE_URL });

try {
	const [table] = await sql<{ name: string | null }[]>`
		SELECT to_regclass('public.video_snapshot')::text AS name
	`;

	if (!table || table.name === null) {
		throw new Error(
			'Table "video_snapshot" is missing. Run "bun run migrate:deploy" or "bun run db:update" first.'
		);
	}

	for (const statement of TIMESCALE_STATEMENTS) {
		await sql.unsafe(statement);
	}

	const [state] = await sql<HypertableState[]>`
		SELECT
			hypertable.compression_enabled,
			EXISTS (
				SELECT 1
				FROM timescaledb_information.jobs AS job
				WHERE job.proc_name = 'policy_compression'
					AND job.hypertable_schema = hypertable.hypertable_schema
					AND job.hypertable_name = hypertable.hypertable_name
			) AS compression_policy
		FROM timescaledb_information.hypertables AS hypertable
		WHERE hypertable.hypertable_schema = 'public'
			AND hypertable.hypertable_name = 'video_snapshot'
	`;

	if (!state?.compression_enabled || !state.compression_policy) {
		throw new Error(
			'"video_snapshot" did not become a compressed hypertable with a compression policy.'
		);
	}

	console.log(
		'TimescaleDB ready: "video_snapshot" is a hypertable with 7-day compression enabled.'
	);
} finally {
	await sql.close();
}
