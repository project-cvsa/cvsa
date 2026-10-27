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

/** Legacy tracking row built from `songs` / `snapshot_schedule` / `eta`. */
export interface LegacyTrackingRow {
	aid: string;
	schedule_type: string | null;
	schedule_started_at: Date | string | null;
	current_views: number | string | null;
	velocity: number | string | null;
	eta_hours: number | string | null;
	target_milestone: number | string | null;
	next_snapshot: Date | string | null;
	published_at: Date | string | null;
}

/** Legacy `public.bilibili_metadata` row. */
export interface LegacyMetadataRow {
	aid: string;
	bvid: string | null;
	title: string | null;
	description: string | null;
	cover_url: string | null;
	published_at: Date | string | null;
	duration: number | string | null;
	uid: string | null;
	tags: string | null;
	created_at: Date | string | null;
}

export interface SnapshotInsertRow {
	aid: string;
	capturedAt: string;
	views: number;
	coins: number;
	likes: number;
	favorites: number;
	shares: number;
	danmakus: number;
	replies: number;
}

export interface TrackingInsertRow {
	aid: string;
	state: string;
	nextSnapshotAt: string;
	lastViews: number;
	velocity: number;
	targetMilestone: number | null;
	etaHours: number | null;
	publishedAt: string | null;
	priority: number;
}

export interface MetadataInsertRow {
	aid: string;
	bvid: string;
	title: string;
	description: string | null;
	pic: string | null;
	pubdate: string | null;
	duration: number;
	mid: string | null;
	tags: string[] | null;
	capturedAt: string;
}

/**
 * A default batch of 1000 rows binds 9000 parameters, comfortably below
 * Postgres' 65535 limit, while keeping one statement per batch.
 *
 * Every write below avoids parameters entirely (see {@link insertSnapshotBatch}),
 * so this is only the **read page size** for the legacy keyset cursors.
 */
export const SNAPSHOT_BATCH_SIZE = 1000;

/**
 * The legacy `video_snapshot` table holds 100M+ rows, so copying its full
 * history is neither practical nor useful. Only the most recent days are
 * exported, which is enough to recover the multi-window history the crawler
 * needs to resume immediately.
 */
export const DEFAULT_SNAPSHOT_DAYS = 7;

/**
 * Rows per read/write batch for migrations.
 *
 * The writers send the whole batch as a single JSON parameter and Postgres
 * expands it with `jsonb_to_recordset`, so there is no bind-parameter ceiling:
 * a batch is only bounded by the process's memory. `--batch-size` is honoured
 * verbatim; the default exists so a bare invocation does not crawl.
 */
export const DEFAULT_IMPORT_BATCH_SIZE = 10_000;

/** Parses `--batch-size`. No upper clamp: the caller decides how much RAM to use. */
export function resolveImportBatchSize(raw: string | undefined): number {
	if (!raw) return DEFAULT_IMPORT_BATCH_SIZE;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_IMPORT_BATCH_SIZE;
	return parsed;
}

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

// ------------------------------------------------------------------ mapping

function toNumber(value: number | string | null | undefined, fallback = 0): number {
	if (value === null || value === undefined) return fallback;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** ISO-8601 with millisecond precision, which `timestamptz` parses exactly. */
function toIsoString(value: Date | string): string | null {
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toSnapshotInsertRow(row: LegacySnapshotRow): SnapshotInsertRow {
	return {
		aid: row.aid,
		capturedAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		views: toNumber(row.views),
		coins: toNumber(row.coins),
		likes: toNumber(row.likes),
		favorites: toNumber(row.favorites),
		shares: toNumber(row.shares),
		danmakus: toNumber(row.danmakus),
		replies: toNumber(row.replies),
	};
}

/**
 * Mirrors the scheduling rules the live `upsertTracking` applies on insert:
 * an unknown schedule type is `regular`, and only a milestone row is promoted
 * to priority 1.
 */
export function toTrackingInsertRow(row: LegacyTrackingRow, now = new Date()): TrackingInsertRow {
	const scheduleType = row.schedule_type ?? "normal";
	const state =
		scheduleType === "milestone" ? "milestone" : scheduleType === "new" ? "new" : "regular";

	let nextSnapshotAt = now.toISOString();
	if (row.next_snapshot) {
		const parsed = toIsoString(row.next_snapshot);
		if (parsed) nextSnapshotAt = parsed;
	} else if (row.schedule_started_at) {
		const parsed = toIsoString(row.schedule_started_at);
		if (parsed) nextSnapshotAt = parsed;
	}

	return {
		aid: row.aid,
		state,
		nextSnapshotAt,
		lastViews: toNumber(row.current_views),
		velocity: toNumber(row.velocity),
		targetMilestone: toNullableNumber(row.target_milestone),
		etaHours: toNullableNumber(row.eta_hours),
		publishedAt: row.published_at ? toIsoString(row.published_at) : null,
		priority: state === "milestone" ? 1 : 2,
	};
}

/** Mirrors the field defaults `bulkUpsertMetadata` applies to a shallow row. */
export function toMetadataInsertRow(row: LegacyMetadataRow, now = new Date()): MetadataInsertRow {
	const tags = row.tags
		? row.tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean)
		: null;

	return {
		aid: row.aid,
		bvid: row.bvid ?? `av${row.aid}`,
		title: row.title ?? "",
		description: row.description ?? null,
		pic: row.cover_url ?? null,
		pubdate: row.published_at ? toIsoString(row.published_at) : null,
		duration: toNumber(row.duration),
		mid: row.uid ?? null,
		tags: tags && tags.length > 0 ? tags : null,
		capturedAt: (row.created_at ? toIsoString(row.created_at) : null) ?? now.toISOString(),
	};
}

// ------------------------------------------------------------------ writing

/**
 * Runs one bulk write.
 *
 * The batch travels as a single JSON parameter and Postgres explodes it with
 * `jsonb_to_recordset`, so the statement has exactly one placeholder no matter
 * how many rows it carries. That removes the 65535-bound-parameter ceiling
 * which forces a parameterised `INSERT` down to ~2k rows, and it keeps the
 * caller from building a giant `VALUES (...), (...)` string by hand.
 */
async function runJsonBatch<T>(pool: Pool, statement: string, rows: readonly T[]): Promise<void> {
	if (rows.length === 0) return;
	await pool.query(statement, [JSON.stringify(rows)]);
}

const SNAPSHOT_INSERT = `
	INSERT INTO "video_snapshot" (
		"aid", "captured_at", "views", "coins", "likes",
		"favorites", "shares", "danmakus", "replies"
	)
	SELECT
		x."aid", x."capturedAt", x."views", x."coins", x."likes",
		x."favorites", x."shares", x."danmakus", x."replies"
	FROM jsonb_to_recordset($1::jsonb) AS x(
		"aid" bigint,
		"capturedAt" timestamptz,
		"views" integer,
		"coins" integer,
		"likes" integer,
		"favorites" integer,
		"shares" integer,
		"danmakus" integer,
		"replies" integer
	)
	ON CONFLICT ("aid", "captured_at") DO NOTHING
`;

/**
 * Upserts tracking rows in one statement. Columns the importer does not know
 * about (`lease_until`, `last_error`, `next_metadata_at`, ...) keep the value
 * the live crawler wrote, exactly like the row-by-row `upsertTracking` did.
 */
const TRACKING_UPSERT = `
	INSERT INTO "video_tracking" (
		"aid", "state", "next_snapshot_at", "last_views", "velocity",
		"target_milestone", "eta_hours", "published_at", "priority",
		"schedule_reason", "updated_at"
	)
	SELECT
		x."aid", x."state", x."nextSnapshotAt", x."lastViews", x."velocity",
		x."targetMilestone", x."etaHours", x."publishedAt", x."priority",
		'initial', now()
	FROM jsonb_to_recordset($1::jsonb) AS x(
		"aid" bigint,
		"state" text,
		"nextSnapshotAt" timestamptz,
		"lastViews" integer,
		"velocity" double precision,
		"targetMilestone" integer,
		"etaHours" double precision,
		"publishedAt" timestamptz,
		"priority" integer
	)
	ON CONFLICT ("aid") DO UPDATE SET
		"state" = EXCLUDED."state",
		"next_snapshot_at" = EXCLUDED."next_snapshot_at",
		"last_views" = EXCLUDED."last_views",
		"velocity" = EXCLUDED."velocity",
		"target_milestone" = EXCLUDED."target_milestone",
		"eta_hours" = EXCLUDED."eta_hours",
		"published_at" = COALESCE(EXCLUDED."published_at", "video_tracking"."published_at"),
		"priority" = EXCLUDED."priority",
		"updated_at" = now()
`;

/**
 * Insert-only metadata write: a richer detail row already in the table must win
 * over the shallow legacy row, which is why this never updates on conflict.
 */
const METADATA_INSERT = `
	INSERT INTO "bilibili_video_metadata" (
		"aid", "bvid", "title", "description", "pic", "pubdate",
		"duration", "mid", "tags", "captured_at", "updated_at"
	)
	SELECT
		x."aid", x."bvid", x."title", x."description", x."pic", x."pubdate",
		x."duration", x."mid", x."tags", x."capturedAt", now()
	FROM jsonb_to_recordset($1::jsonb) AS x(
		"aid" bigint,
		"bvid" text,
		"title" text,
		"description" text,
		"pic" text,
		"pubdate" timestamptz,
		"duration" integer,
		"mid" bigint,
		"tags" jsonb,
		"capturedAt" timestamptz
	)
	ON CONFLICT ("aid") DO NOTHING
`;

export async function insertSnapshotBatch(
	pool: Pool,
	rows: readonly SnapshotInsertRow[]
): Promise<void> {
	await runJsonBatch(pool, SNAPSHOT_INSERT, rows);
}

export async function upsertTrackingBatch(
	pool: Pool,
	rows: readonly TrackingInsertRow[]
): Promise<void> {
	await runJsonBatch(pool, TRACKING_UPSERT, rows);
}

export async function insertMetadataBatch(
	pool: Pool,
	rows: readonly MetadataInsertRow[]
): Promise<void> {
	await runJsonBatch(pool, METADATA_INSERT, rows);
}
