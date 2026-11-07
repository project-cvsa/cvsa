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
	'CREATE SCHEMA IF NOT EXISTS "extensions"',
	'GRANT USAGE ON SCHEMA "extensions" TO PUBLIC',
	`DO $$
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
	END $$`,
	"SELECT create_hypertable('video_snapshot', 'captured_at', chunk_time_interval => INTERVAL '30 days', if_not_exists => TRUE)",
	"SELECT set_chunk_time_interval('video_snapshot', INTERVAL '30 days')",
	`ALTER TABLE "video_snapshot" SET (
		timescaledb.compress,
		timescaledb.compress_segmentby = 'aid',
		timescaledb.compress_orderby = 'captured_at DESC'
	)`,
	"SELECT add_compression_policy('video_snapshot', INTERVAL '7 days', if_not_exists => TRUE)",
	"SELECT remove_retention_policy('video_snapshot', if_exists => TRUE)",
	`CREATE OR REPLACE FUNCTION update_latest_video_snapshot() RETURNS TRIGGER AS $$
	BEGIN
		INSERT INTO latest_video_snapshot (
			aid, captured_at, views, coins, likes, favorites, shares, danmakus, replies
		) VALUES (
			NEW.aid, NEW.captured_at, NEW.views, NEW.coins, NEW.likes, NEW.favorites, NEW.shares, NEW.danmakus, NEW.replies
		)
		ON CONFLICT (aid) DO UPDATE SET
			captured_at = EXCLUDED.captured_at,
			views = EXCLUDED.views,
			coins = EXCLUDED.coins,
			likes = EXCLUDED.likes,
			favorites = EXCLUDED.favorites,
			shares = EXCLUDED.shares,
			danmakus = EXCLUDED.danmakus,
			replies = EXCLUDED.replies
		WHERE latest_video_snapshot.views < EXCLUDED.views
		   OR latest_video_snapshot.captured_at <= EXCLUDED.captured_at;
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;`,
	`DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_latest_video_snapshot'
		) THEN
			CREATE TRIGGER trg_update_latest_video_snapshot
			AFTER INSERT ON video_snapshot
			FOR EACH ROW
			EXECUTE FUNCTION update_latest_video_snapshot();
		END IF;
	END;
	$$;`,
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
