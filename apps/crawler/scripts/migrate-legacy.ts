import { resolve } from "node:path";
import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import { Pool } from "pg";
import {
	compressEligibleSnapshotChunks,
	DEFAULT_BATCH_SIZE,
	DEFAULT_WINDOW_DAYS,
	discoverLegacySnapshotWindows,
	insertMetadataBatch,
	insertSnapshotBatch,
	type LegacyMetadataRow,
	type LegacyTrackingRow,
	loadMigrationState,
	parseWindowDays,
	resolveBatchSize,
	saveMigrationState,
	streamLegacySnapshotWindow,
	toMetadataInsertRow,
	toTrackingInsertRow,
	upsertTrackingBatch,
	windowKey,
} from "./legacy";

export interface LegacyMigrationOptions {
	legacyDbUrl: string;
	snapshotDbUrl: string;
	batchSize: number;
	windowDays: number;
	stateFile: string;
	includeTracking: boolean;
	includeMetadata: boolean;
	includeSnapshots: boolean;
	compressChunks: boolean;
	compressOlderThan: string;
	dryRun: boolean;
	since: Date | null;
	until: Date | null;
	maxWindows?: number;
	limit?: number;
}

function parseOptionalDate(raw: string | undefined, flagName: string): Date | null {
	if (!raw) return null;
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid ISO date for ${flagName}: ${raw}`);
	}
	return parsed;
}

export function parseMigrationCliArgs(
	argv: readonly string[] = process.argv.slice(2)
): LegacyMigrationOptions {
	let legacyDbUrl = process.env.LEGACY_DATABASE_URL ?? "";
	let snapshotDbUrl = crawlerEnv.SNAPSHOT_DATABASE_URL;
	let batchSize = DEFAULT_BATCH_SIZE;
	let windowDays = DEFAULT_WINDOW_DAYS;
	let stateFile = ".legacy-snapshots-state.json";
	let includeTracking = true;
	let includeMetadata = true;
	let includeSnapshots = true;
	let compressChunks = true;
	let compressOlderThan = "7 days";
	let dryRun = false;
	let since: Date | null = null;
	let until: Date | null = null;
	let maxWindows: number | undefined;
	let limit: number | undefined;

	for (const arg of argv) {
		if (arg.startsWith("--legacy-db=")) {
			legacyDbUrl = arg.slice("--legacy-db=".length);
		} else if (arg.startsWith("--snapshot-db=")) {
			snapshotDbUrl = arg.slice("--snapshot-db=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSize = resolveBatchSize(arg.slice("--batch-size=".length));
		} else if (arg.startsWith("--window-days=")) {
			windowDays = parseWindowDays(arg.slice("--window-days=".length));
		} else if (arg.startsWith("--state-file=")) {
			stateFile = arg.slice("--state-file=".length);
		} else if (arg === "--snapshots-only") {
			includeTracking = false;
			includeMetadata = false;
			includeSnapshots = true;
		} else if (arg === "--no-tracking") {
			includeTracking = false;
		} else if (arg === "--no-metadata") {
			includeMetadata = false;
		} else if (arg === "--no-snapshots") {
			includeSnapshots = false;
		} else if (arg === "--no-compress") {
			compressChunks = false;
		} else if (arg.startsWith("--compress-older-than=")) {
			compressOlderThan = arg.slice("--compress-older-than=".length);
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg.startsWith("--since=")) {
			since = parseOptionalDate(arg.slice("--since=".length), "--since");
		} else if (arg.startsWith("--until=")) {
			until = parseOptionalDate(arg.slice("--until=".length), "--until");
		} else if (arg.startsWith("--snapshot-days=")) {
			const days = parseWindowDays(arg.slice("--snapshot-days=".length));
			since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
		} else if (arg.startsWith("--max-windows=")) {
			const parsed = Number.parseInt(arg.slice("--max-windows=".length), 10);
			if (Number.isInteger(parsed) && parsed > 0) {
				maxWindows = parsed;
			}
		} else if (arg.startsWith("--limit=")) {
			const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
			if (Number.isInteger(parsed) && parsed > 0) {
				limit = parsed;
			}
		}
	}

	if (!legacyDbUrl) {
		throw new Error(
			"LEGACY_DATABASE_URL environment variable or --legacy-db=<url> argument is required"
		);
	}

	return {
		legacyDbUrl,
		snapshotDbUrl,
		batchSize,
		windowDays,
		stateFile: resolve(stateFile),
		includeTracking,
		includeMetadata,
		includeSnapshots,
		compressChunks,
		compressOlderThan,
		dryRun,
		since,
		until,
		maxWindows,
		limit,
	};
}

async function migrateTracking(
	legacyPool: Pool,
	snapshotPool: Pool,
	options: LegacyMigrationOptions
): Promise<number> {
	const countResult = await legacyPool.query<{ count: string }>(`
		WITH active_aids AS (
			SELECT aid FROM songs WHERE deleted = false AND aid IS NOT NULL
			UNION
			SELECT aid FROM snapshot_schedule WHERE status IN ('pending', 'processing')
			UNION
			SELECT aid FROM eta WHERE aid IS NOT NULL
		)
		SELECT COUNT(*)::text AS count FROM active_aids
	`);

	const totalActive = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);
	const targetTotal = options.limit ? Math.min(totalActive, options.limit) : totalActive;
	appLogger.info(`Found ${totalActive} active tracking records in legacy database`);

	if (options.dryRun || targetTotal === 0) {
		return 0;
	}

	let lastAid = "0";
	let migrated = 0;

	while (migrated < targetTotal) {
		const batchLimit = Math.min(options.batchSize, targetTotal - migrated);
		const trackingRows = await legacyPool.query<LegacyTrackingRow>(
			`
			WITH active_aids AS (
				SELECT aid FROM songs WHERE deleted = false AND aid IS NOT NULL
				UNION
				SELECT aid FROM snapshot_schedule WHERE status IN ('pending', 'processing')
				UNION
				SELECT aid FROM eta WHERE aid IS NOT NULL
			)
			SELECT
				a.aid::text,
				s.type AS schedule_type,
				s.started_at AS schedule_started_at,
				e.current_views,
				e.speed AS velocity,
				COALESCE(ie.eta_hours, e.eta) AS eta_hours,
				ie.target_milestone,
				ie.next_snapshot,
				m.published_at
			FROM active_aids a
			LEFT JOIN LATERAL (
				SELECT type, started_at FROM snapshot_schedule
				WHERE snapshot_schedule.aid = a.aid AND status IN ('pending', 'processing')
				ORDER BY started_at ASC LIMIT 1
			) s ON true
			LEFT JOIN eta e ON e.aid = a.aid
			LEFT JOIN internal.eta ie ON ie.aid = a.aid
			LEFT JOIN bilibili_metadata m ON m.aid = a.aid
			WHERE a.aid > $1::bigint
			ORDER BY a.aid ASC
			LIMIT $2
			`,
			[lastAid, batchLimit]
		);

		if (trackingRows.rows.length === 0) break;

		const now = new Date();
		await upsertTrackingBatch(
			snapshotPool,
			trackingRows.rows.map((row) => toTrackingInsertRow(row, now))
		);
		migrated += trackingRows.rows.length;
		lastAid = trackingRows.rows[trackingRows.rows.length - 1].aid;

		appLogger.info(
			`Migrated ${migrated} / ${targetTotal} tracking records (${Math.round((migrated / targetTotal) * 100)}%)`
		);
	}

	return migrated;
}

async function migrateMetadata(
	legacyPool: Pool,
	snapshotPool: Pool,
	options: LegacyMigrationOptions
): Promise<number> {
	const metaCountResult = await legacyPool.query<{ count: string }>(
		"SELECT COUNT(*)::text AS count FROM bilibili_metadata"
	);
	const totalMeta = Number.parseInt(metaCountResult.rows[0]?.count ?? "0", 10);
	const targetTotal = options.limit ? Math.min(totalMeta, options.limit) : totalMeta;
	appLogger.info(`Found ${totalMeta} metadata records in legacy database`);

	if (options.dryRun || targetTotal === 0) {
		return 0;
	}

	let lastMetaAid = "0";
	let migrated = 0;

	while (migrated < targetTotal) {
		const batchLimit = Math.min(options.batchSize, targetTotal - migrated);
		const metaRows = await legacyPool.query<LegacyMetadataRow>(
			`
			SELECT
				aid::text,
				bvid,
				title,
				description,
				cover_url,
				published_at,
				duration,
				uid::text,
				tags,
				created_at
			FROM bilibili_metadata
			WHERE aid > $1::bigint
			ORDER BY bilibili_metadata.aid ASC
			LIMIT $2
			`,
			[lastMetaAid, batchLimit]
		);

		if (metaRows.rows.length === 0) break;

		const now = new Date();
		await insertMetadataBatch(
			snapshotPool,
			metaRows.rows.map((row) => toMetadataInsertRow(row, now))
		);
		migrated += metaRows.rows.length;
		lastMetaAid = metaRows.rows[metaRows.rows.length - 1].aid;

		appLogger.info(
			`Migrated ${migrated} / ${targetTotal} metadata records (${Math.round((migrated / targetTotal) * 100)}%)`
		);
	}

	return migrated;
}

async function migrateSnapshots(
	legacyPool: Pool,
	snapshotPool: Pool,
	options: LegacyMigrationOptions
): Promise<{
	totalWindows: number;
	migratedWindows: number;
	skippedWindows: number;
	migratedRows: number;
}> {
	const windows = await discoverLegacySnapshotWindows(legacyPool, {
		windowDays: options.windowDays,
		since: options.since,
		until: options.until,
	});

	const state = loadMigrationState(options.stateFile);
	const pendingWindows = windows.filter((w) => !(windowKey(w) in state.completedWindows));
	const skippedWindows = windows.length - pendingWindows.length;
	const targetWindows = options.maxWindows
		? pendingWindows.slice(0, options.maxWindows)
		: pendingWindows;

	appLogger.info("Discovered legacy snapshot time windows", {
		totalWindows: windows.length,
		alreadyCompleted: skippedWindows,
		remainingWindows: pendingWindows.length,
		scheduledThisRun: targetWindows.length,
	});

	if (options.dryRun || targetWindows.length === 0) {
		return {
			totalWindows: windows.length,
			migratedWindows: 0,
			skippedWindows,
			migratedRows: 0,
		};
	}

	let migratedWindows = 0;
	let migratedRowsThisRun = 0;
	const runStartedAt = Date.now();

	for (const window of targetWindows) {
		const windowStartMs = Date.now();
		let windowRows = 0;
		let pendingWrite: Promise<void> | null = null;

		// Pipeline reads and writes: while the legacy server fetches and
		// decompresses the next cursor batch across the inter-continental link,
		// the target server inserts the previous batch concurrently.
		const streamedRows = await streamLegacySnapshotWindow(
			legacyPool,
			window,
			options.batchSize,
			async (batch) => {
				if (pendingWrite) {
					await pendingWrite;
				}
				windowRows += batch.length;
				pendingWrite = insertSnapshotBatch(snapshotPool, batch);
			}
		);

		if (pendingWrite) {
			await pendingWrite;
		}

		let compressedCount = 0;
		if (options.compressChunks && streamedRows > 0) {
			try {
				compressedCount = await compressEligibleSnapshotChunks(
					snapshotPool,
					options.compressOlderThan
				);
			} catch (compressError) {
				appLogger.warn("Chunk compression skipped or not supported on target table", {
					error: (compressError as Error).message,
				});
			}
		}

		migratedWindows++;
		migratedRowsThisRun += windowRows;

		const key = windowKey(window);
		state.completedWindows[key] = {
			rangeStart: window.rangeStart,
			rangeEnd: window.rangeEnd,
			rowsMigrated: windowRows,
			completedAt: new Date().toISOString(),
		};
		state.totalRowsMigrated += windowRows;
		saveMigrationState(options.stateFile, state);

		const elapsedWindowSec = Math.max(0.001, (Date.now() - windowStartMs) / 1_000);
		const totalElapsedSec = Math.max(0.001, (Date.now() - runStartedAt) / 1_000);
		const rowsPerSec = Math.round(migratedRowsThisRun / totalElapsedSec);

		appLogger.info(
			`Window [${migratedWindows}/${targetWindows.length}] ${window.rangeStart} -> ${window.rangeEnd}`,
			{
				sourceChunk: window.sourceChunkName,
				windowRows,
				windowSec: Number(elapsedWindowSec.toFixed(2)),
				compressedChunks: compressedCount,
				totalRowsMigrated: state.totalRowsMigrated,
				avgRowsPerSec: rowsPerSec,
			}
		);
	}

	return {
		totalWindows: windows.length,
		migratedWindows,
		skippedWindows,
		migratedRows: migratedRowsThisRun,
	};
}

export async function runLegacyMigration(options: LegacyMigrationOptions): Promise<void> {
	appLogger.info("Starting legacy database migration...", {
		batchSize: options.batchSize,
		windowDays: options.windowDays,
		stateFile: options.stateFile,
		includeTracking: options.includeTracking,
		includeMetadata: options.includeMetadata,
		includeSnapshots: options.includeSnapshots,
		compressChunks: options.compressChunks,
		dryRun: options.dryRun,
		since: options.since?.toISOString() ?? null,
		until: options.until?.toISOString() ?? null,
		maxWindows: options.maxWindows ?? null,
		limit: options.limit ?? null,
	});

	const legacyPool = new Pool({ connectionString: options.legacyDbUrl, max: 2 });
	const snapshotPool = new Pool({ connectionString: options.snapshotDbUrl, max: 2 });

	try {
		await legacyPool.query("SELECT 1");
		await snapshotPool.query("SELECT 1");
	} catch (error) {
		appLogger.error("Failed to connect to database", {
			legacyDbUrl: options.legacyDbUrl.replace(/:[^:@]+@/, ":***@"),
			error,
		});
		await legacyPool.end();
		await snapshotPool.end();
		throw error;
	}

	try {
		let migratedTracking = 0;
		let migratedMetadata = 0;
		let migratedSnapshots = 0;

		if (options.includeTracking) {
			migratedTracking = await migrateTracking(legacyPool, snapshotPool, options);
		}
		if (options.includeMetadata) {
			migratedMetadata = await migrateMetadata(legacyPool, snapshotPool, options);
		}
		if (options.includeSnapshots) {
			const snapResult = await migrateSnapshots(legacyPool, snapshotPool, options);
			migratedSnapshots = snapResult.migratedRows;
		}

		appLogger.info("Legacy migration completed!", {
			migratedTracking,
			migratedMetadata,
			migratedSnapshots,
		});
	} finally {
		await legacyPool.end();
		await snapshotPool.end();
	}
}

if (import.meta.main) {
	const opts = parseMigrationCliArgs();
	runLegacyMigration(opts).catch((error) => {
		appLogger.error("Legacy migration failed", { error });
		process.exit(1);
	});
}
