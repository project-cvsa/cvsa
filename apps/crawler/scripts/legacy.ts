import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Pool } from "pg";

/**
 * Legacy `public.video_snapshot` row as `pg` returns it. `aid` is an int8 and
 * therefore serialized as a string, while `id` is the legacy int4 primary key.
 */
export interface LegacySnapshotRow {
	id?: number;
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
 * Default time-window width (in days) when partitioning full-history snapshot
 * migrations across an ordinary Postgres table or when TimescaleDB chunk
 * boundaries are not queried directly.
 */
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * Default cursor `FETCH` and `jsonb_to_recordset` write batch size.
 *
 * The writers send the whole batch as a single JSON parameter and Postgres
 * expands it with `jsonb_to_recordset`, so there is no 65535 bind-parameter
 * ceiling: a batch is only bounded by memory.
 */
export const DEFAULT_BATCH_SIZE = 25_000;

export interface SnapshotTimeWindow {
	readonly index: number;
	readonly rangeStart: string;
	readonly rangeEnd: string;
	readonly sourceChunkName: string | null;
}

export interface SnapshotBoundsRow {
	min_created_at: Date | string | null;
	max_created_at: Date | string | null;
}

interface TimescaleChunkBoundaryRow {
	chunk_name: string;
	range_start: Date | string;
	range_end: Date | string;
}

export interface CompletedWindowRecord {
	rangeStart: string;
	rangeEnd: string;
	rowsMigrated: number;
	completedAt: string;
}

export interface SnapshotMigrationState {
	version: 1;
	updatedAt: string;
	totalRowsMigrated: number;
	completedWindows: Record<string, CompletedWindowRecord>;
}

/** Parses `--batch-size`. No upper clamp: the caller decides how much RAM to use. */
export function resolveBatchSize(raw: string | undefined): number {
	if (!raw) return DEFAULT_BATCH_SIZE;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
	return parsed;
}

/** Parses `--window-days`, falling back to `DEFAULT_WINDOW_DAYS` for invalid input. */
export function parseWindowDays(raw: string | undefined): number {
	if (!raw) return DEFAULT_WINDOW_DAYS;
	const days = Number.parseInt(raw, 10);
	return Number.isInteger(days) && days > 0 ? days : DEFAULT_WINDOW_DAYS;
}

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

/**
 * Splits a `[minDate, maxDate]` span into contiguous `[rangeStart, rangeEnd)`
 * half-open intervals of `windowDays` days.
 *
 * We add 1 millisecond to `maxDate` when the final boundary coincides with
 * `maxDate` so the half-open `< rangeEnd` predicate always includes the last row.
 */
export function buildTimeWindows(
	minDate: Date,
	maxDate: Date,
	windowDays = DEFAULT_WINDOW_DAYS
): SnapshotTimeWindow[] {
	const startMs = minDate.getTime();
	const endMs = maxDate.getTime() + 1;
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
		return [];
	}

	const stepMs = windowDays * 24 * 60 * 60 * 1_000;
	const windows: SnapshotTimeWindow[] = [];
	let cursorMs = startMs;
	let index = 0;

	while (cursorMs < endMs) {
		const nextMs = Math.min(cursorMs + stepMs, endMs);
		windows.push({
			index,
			rangeStart: new Date(cursorMs).toISOString(),
			rangeEnd: new Date(nextMs).toISOString(),
			sourceChunkName: null,
		});
		cursorMs = nextMs;
		index++;
	}

	return windows;
}

/**
 * Discovers time windows for `video_snapshot` migration.
 *
 * 1. First attempts to read native TimescaleDB chunk boundaries from
 *    `timescaledb_information.chunks` on the legacy database. Aligning reads
 *    1:1 with compressed chunks guarantees each compressed chunk is touched in
 *    exactly one window.
 * 2. If `video_snapshot` on the legacy server is a plain PostgreSQL table (or
 *    `timescaledb_information.chunks` is unavailable), falls back to querying
 *    `MIN(created_at)` / `MAX(created_at)` and slicing into `windowDays` steps.
 */
export async function discoverLegacySnapshotWindows(
	legacyPool: Pool,
	options: {
		windowDays: number;
		since?: Date | null;
		until?: Date | null;
	}
): Promise<SnapshotTimeWindow[]> {
	try {
		const chunkResult = await legacyPool.query<TimescaleChunkBoundaryRow>(
			`
			SELECT
				chunk_name::text AS chunk_name,
				range_start,
				range_end
			FROM timescaledb_information.chunks
			WHERE hypertable_name = 'video_snapshot'
				AND range_start IS NOT NULL
				AND range_end IS NOT NULL
			ORDER BY range_start ASC
			`
		);

		if (chunkResult.rows.length > 0) {
			const windows: SnapshotTimeWindow[] = [];
			for (const row of chunkResult.rows) {
				const startIso = toIsoString(row.range_start);
				const endIso = toIsoString(row.range_end);
				if (!startIso || !endIso) continue;

				const startMs = new Date(startIso).getTime();
				const endMs = new Date(endIso).getTime();
				if (options.since && endMs <= options.since.getTime()) continue;
				if (options.until && startMs >= options.until.getTime()) continue;

				const clampedStart =
					options.since && startMs < options.since.getTime()
						? options.since.toISOString()
						: startIso;
				const clampedEnd =
					options.until && endMs > options.until.getTime()
						? options.until.toISOString()
						: endIso;

				if (new Date(clampedStart).getTime() >= new Date(clampedEnd).getTime()) {
					continue;
				}

				windows.push({
					index: windows.length,
					rangeStart: clampedStart,
					rangeEnd: clampedEnd,
					sourceChunkName: row.chunk_name,
				});
			}

			if (windows.length > 0) {
				return windows;
			}
		}
	} catch {
		// Legacy database might not have timescaledb_information.chunks or permissions;
		// fall back to MIN/MAX(created_at) range partitioning.
	}

	const predicates: string[] = [];
	const params: string[] = [];
	if (options.since) {
		params.push(options.since.toISOString());
		predicates.push(`created_at >= $${params.length}::timestamptz`);
	}
	if (options.until) {
		params.push(options.until.toISOString());
		predicates.push(`created_at < $${params.length}::timestamptz`);
	}
	const whereClause = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";

	const boundsResult = await legacyPool.query<SnapshotBoundsRow>(
		`
		SELECT
			MIN(created_at) AS min_created_at,
			MAX(created_at) AS max_created_at
		FROM video_snapshot
		${whereClause}
		`,
		params
	);

	const row = boundsResult.rows[0];
	if (!row?.min_created_at || !row.max_created_at) {
		return [];
	}

	const minIso = toIsoString(row.min_created_at);
	const maxIso = toIsoString(row.max_created_at);
	if (!minIso || !maxIso) {
		return [];
	}

	const minDate = options.since ?? new Date(minIso);
	const maxDate = options.until ? new Date(options.until.getTime() - 1) : new Date(maxIso);

	return buildTimeWindows(minDate, maxDate, options.windowDays);
}

/**
 * Streams a single `[rangeStart, rangeEnd)` time window from the legacy
 * `video_snapshot` table using a server-side `NO SCROLL` cursor **without**
 * `ORDER BY (created_at, id)`.
 *
 * On a TimescaleDB compressed hypertable (segmented by `aid`, ordered by
 * `created_at`), `ORDER BY created_at ASC, id ASC LIMIT N` forces PostgreSQL to
 * decompress every segment in the chunk and run a full merge sort on every page.
 * A single forward-only cursor over `[rangeStart, rangeEnd)` inside a repeatable-read
 * read-only transaction decompresses each segment once and streams batches over
 * the connection with zero temporary disk usage on the legacy VPS.
 */
export async function streamLegacySnapshotWindow(
	legacyPool: Pool,
	window: SnapshotTimeWindow,
	batchSize: number,
	onBatch: (rows: readonly SnapshotInsertRow[]) => Promise<void>
): Promise<number> {
	const client = await legacyPool.connect();
	let totalRows = 0;

	try {
		await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
		await client.query(
			`
			DECLARE snapshot_window_cursor NO SCROLL CURSOR FOR
			SELECT
				aid::text AS aid,
				created_at,
				COALESCE(views, 0) AS views,
				COALESCE(coins, 0) AS coins,
				COALESCE(likes, 0) AS likes,
				COALESCE(favorites, 0) AS favorites,
				COALESCE(shares, 0) AS shares,
				COALESCE(danmakus, 0) AS danmakus,
				COALESCE(replies, 0) AS replies
			FROM video_snapshot
			WHERE created_at >= $1::timestamptz
				AND created_at < $2::timestamptz
			`,
			[window.rangeStart, window.rangeEnd]
		);

		const fetchCount = Math.max(1, Math.trunc(batchSize));

		while (true) {
			const res = await client.query<LegacySnapshotRow>(
				`FETCH FORWARD ${fetchCount} FROM snapshot_window_cursor`
			);
			if (res.rows.length === 0) break;

			const mapped: SnapshotInsertRow[] = new Array(res.rows.length);
			for (let i = 0; i < res.rows.length; i++) {
				const r = res.rows[i];
				mapped[i] = {
					aid: r.aid,
					capturedAt: toIsoString(r.created_at) ?? window.rangeStart,
					views: toNumber(r.views),
					coins: toNumber(r.coins),
					likes: toNumber(r.likes),
					favorites: toNumber(r.favorites),
					shares: toNumber(r.shares),
					danmakus: toNumber(r.danmakus),
					replies: toNumber(r.replies),
				};
			}

			await onBatch(mapped);
			totalRows += mapped.length;
		}

		await client.query("CLOSE snapshot_window_cursor");
		await client.query("COMMIT");
	} catch (error) {
		try {
			await client.query("ROLLBACK");
		} catch {
			// ignore rollback errors on broken connections
		}
		throw error;
	} finally {
		client.release();
	}

	return totalRows;
}

/**
 * Compresses all uncompressed TimescaleDB chunks on the target `video_snapshot`
 * hypertable that are older than `olderThanInterval` (default `7 days`).
 *
 * Calling this after each historical window completes keeps the target VPS's
 * disk footprint bounded to a few gigabytes even while importing 100M+ rows.
 */
export async function compressEligibleSnapshotChunks(
	snapshotPool: Pool,
	olderThanInterval = "7 days"
): Promise<number> {
	const result = await snapshotPool.query<{ compressed_chunk: string }>(
		`
		SELECT compress_chunk(chunk, if_not_compressed => true)::text AS compressed_chunk
		FROM show_chunks('video_snapshot', older_than => $1::interval) AS chunk
		`,
		[olderThanInterval]
	);
	return result.rows.length;
}

export function windowKey(window: Pick<SnapshotTimeWindow, "rangeStart" | "rangeEnd">): string {
	return `${window.rangeStart}..${window.rangeEnd}`;
}

export function loadMigrationState(stateFilePath: string): SnapshotMigrationState {
	if (!existsSync(stateFilePath)) {
		return {
			version: 1,
			updatedAt: new Date().toISOString(),
			totalRowsMigrated: 0,
			completedWindows: {},
		};
	}

	const raw: unknown = JSON.parse(readFileSync(stateFilePath, "utf-8"));
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new Error(`Invalid state file format at ${stateFilePath}`);
	}

	const record = raw as Record<string, unknown>;
	const completedRaw = record.completedWindows;
	const completedWindows: Record<string, CompletedWindowRecord> = {};

	if (typeof completedRaw === "object" && completedRaw !== null && !Array.isArray(completedRaw)) {
		for (const [key, val] of Object.entries(completedRaw as Record<string, unknown>)) {
			if (typeof val === "object" && val !== null && !Array.isArray(val)) {
				const item = val as Record<string, unknown>;
				if (
					typeof item.rangeStart === "string" &&
					typeof item.rangeEnd === "string" &&
					typeof item.rowsMigrated === "number" &&
					typeof item.completedAt === "string"
				) {
					completedWindows[key] = {
						rangeStart: item.rangeStart,
						rangeEnd: item.rangeEnd,
						rowsMigrated: item.rowsMigrated,
						completedAt: item.completedAt,
					};
				}
			}
		}
	}

	const totalRowsMigrated =
		typeof record.totalRowsMigrated === "number" && Number.isFinite(record.totalRowsMigrated)
			? record.totalRowsMigrated
			: Object.values(completedWindows).reduce((sum, w) => sum + w.rowsMigrated, 0);

	return {
		version: 1,
		updatedAt:
			typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
		totalRowsMigrated,
		completedWindows,
	};
}

export function saveMigrationState(stateFilePath: string, state: SnapshotMigrationState): void {
	state.updatedAt = new Date().toISOString();
	writeFileSync(stateFilePath, `${JSON.stringify(state, null, "\t")}\n`, "utf-8");
}
