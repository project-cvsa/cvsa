import type { Pool } from "pg";

/**
 * Legacy `public.video_snapshot` row, as `pg` returns it. `aid` is an int8 and
 * therefore a string, while `id` is the legacy int4 primary key. The pair
 * `(created_at, id)` drives keyset pagination over the recent window.
 */
export interface LegacySnapshotRow {
	id: number;
	aid: string;
	created_at: Date | string;
	views: number;
	coins: number;
	likes: number;
	favorites: number;
	shares: number;
	danmakus: number;
	replies: number;
}

export interface SnapshotInsertRow {
	aid: string;
	capturedAt: Date | string;
	views: number;
	coins: number;
	likes: number;
	favorites: number;
	shares: number;
	danmakus: number;
	replies: number;
}

const SNAPSHOT_COLUMNS = [
	"aid",
	"captured_at",
	"views",
	"coins",
	"likes",
	"favorites",
	"shares",
	"danmakus",
	"replies",
] as const;

/** Column list used by both the insert and the batch-sizing note below. */
const SNAPSHOT_COLUMN_LIST = SNAPSHOT_COLUMNS.map((column) => `"${column}"`).join(", ");

/**
 * A default batch of 1000 rows binds 9000 parameters, comfortably below
 * Postgres' 65535 limit, while keeping one statement per batch.
 */
export const SNAPSHOT_BATCH_SIZE = 1000;

/**
 * The legacy `video_snapshot` table holds 100M+ rows, so copying its full
 * history is neither practical nor useful. Only the most recent days are
 * exported, which is enough to recover the multi-window history the crawler
 * needs to resume immediately.
 */
export const DEFAULT_SNAPSHOT_DAYS = 7;

/** Parses `--snapshot-days`, falling back to the default for invalid input. */
export function parseSnapshotDays(raw: string | undefined): number {
	if (!raw) return DEFAULT_SNAPSHOT_DAYS;
	const days = Number.parseInt(raw, 10);
	return Number.isInteger(days) && days > 0 ? days : DEFAULT_SNAPSHOT_DAYS;
}

/**
 * Resolves the recent-window cutoff on the legacy server's clock. The legacy
 * `video_snapshot` table has an index on `created_at`, so every read uses this
 * bound instead of scanning the full history.
 */
export async function resolveSnapshotCutoff(pool: Pool, snapshotDays: number): Promise<Date> {
	const { rows } = await pool.query<{ cutoff: Date }>(
		"SELECT NOW() - ($1 * INTERVAL '1 day') AS cutoff",
		[snapshotDays]
	);
	return rows[0]?.cutoff ?? new Date(Date.now() - snapshotDays * 24 * 60 * 60 * 1_000);
}

export function toSnapshotInsertRow(row: LegacySnapshotRow): SnapshotInsertRow {
	return {
		aid: row.aid,
		capturedAt: row.created_at,
		views: row.views,
		coins: row.coins,
		likes: row.likes,
		favorites: row.favorites,
		shares: row.shares,
		danmakus: row.danmakus,
		replies: row.replies,
	};
}

/**
 * Inserts one batch with a single `INSERT ... ON CONFLICT DO NOTHING`, so a
 * re-run or an overlapping snapshot is skipped instead of aborting the import.
 */
export async function insertSnapshotBatch(
	pool: Pool,
	rows: readonly SnapshotInsertRow[]
): Promise<void> {
	if (rows.length === 0) return;

	const values: unknown[] = [];
	const tuples = rows.map((row, rowIndex) => {
		const offset = rowIndex * SNAPSHOT_COLUMNS.length;
		values.push(
			row.aid,
			row.capturedAt,
			row.views,
			row.coins,
			row.likes,
			row.favorites,
			row.shares,
			row.danmakus,
			row.replies
		);
		const placeholders = SNAPSHOT_COLUMNS.map((_, column) => `$${offset + column + 1}`);
		return `(${placeholders.join(", ")})`;
	});

	await pool.query(
		`INSERT INTO "video_snapshot" (${SNAPSHOT_COLUMN_LIST})
		 VALUES ${tuples.join(", ")}
		 ON CONFLICT ("aid", "captured_at") DO NOTHING`,
		values
	);
}
