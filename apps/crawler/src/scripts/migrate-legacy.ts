import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import { Pool, type QueryResult } from "pg";
import {
	DEFAULT_SNAPSHOT_DAYS,
	insertMetadataBatch,
	insertSnapshotBatch,
	type LegacyMetadataRow,
	type LegacySnapshotRow,
	type LegacyTrackingRow,
	parseSnapshotDays,
	resolveImportBatchSize,
	resolveSnapshotCutoff,
	toMetadataInsertRow,
	toSnapshotInsertRow,
	toTrackingInsertRow,
	upsertTrackingBatch,
} from "./legacy-snapshots";

interface MigrationOptions {
	legacyDbUrl: string;
	batchSize: number;
	dryRun: boolean;
	includeMetadata: boolean;
	includeSnapshots: boolean;
	snapshotDays: number;
	limit?: number;
}

function parseCliArgs(): MigrationOptions {
	const args = process.argv.slice(2);
	let legacyDbUrl = process.env.LEGACY_DATABASE_URL ?? "";
	let batchSize = resolveImportBatchSize(undefined);
	let dryRun = false;
	let includeMetadata = true;
	let includeSnapshots = true;
	let snapshotDays = DEFAULT_SNAPSHOT_DAYS;
	let limit: number | undefined;

	for (const arg of args) {
		if (arg.startsWith("--legacy-db=")) {
			legacyDbUrl = arg.slice("--legacy-db=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSize = resolveImportBatchSize(arg.slice("--batch-size=".length));
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--no-metadata") {
			includeMetadata = false;
		} else if (arg === "--no-snapshots") {
			includeSnapshots = false;
		} else if (arg.startsWith("--snapshot-days=")) {
			snapshotDays = parseSnapshotDays(arg.slice("--snapshot-days=".length));
		} else if (arg.startsWith("--limit=")) {
			limit = Number.parseInt(arg.slice("--limit=".length), 10);
		}
	}

	if (!legacyDbUrl) {
		throw new Error(
			"LEGACY_DATABASE_URL environment variable or --legacy-db=<url> argument is required"
		);
	}

	return {
		legacyDbUrl,
		batchSize,
		dryRun,
		includeMetadata,
		includeSnapshots,
		snapshotDays,
		limit,
	};
}

export async function runLegacyMigration(options: MigrationOptions): Promise<void> {
	appLogger.info("Starting legacy database migration...", {
		batchSize: options.batchSize,
		dryRun: options.dryRun,
		includeMetadata: options.includeMetadata,
		includeSnapshots: options.includeSnapshots,
		snapshotDays: options.snapshotDays,
		limit: options.limit,
	});

	const legacyPool = new Pool({
		connectionString: options.legacyDbUrl,
	});
	// Every write goes through `pg` as a single `INSERT ... SELECT FROM
	// jsonb_to_recordset($1)` statement, and the keyset cursor keeps the source
	// read memory-bounded.
	const snapshotPool = new Pool({
		connectionString: crawlerEnv.SNAPSHOT_DATABASE_URL,
	});

	try {
		await legacyPool.query("SELECT 1");
		appLogger.info("Successfully connected to legacy database");
	} catch (error) {
		appLogger.error("Failed to connect to legacy database", {
			legacyDbUrl: options.legacyDbUrl.replace(/:[^:@]+@/, ":***@"),
			error,
		});
		throw error;
	}

	try {
		// 1. Count active tracking items
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
		appLogger.info(`Found ${totalActive} active videos in legacy database`);

		if (options.dryRun) {
			appLogger.info(`[DRY-RUN] Would migrate ${totalActive} tracking records.`);
			if (options.includeMetadata) {
				const metaCountResult = await legacyPool.query<{ count: string }>(
					"SELECT COUNT(*)::text AS count FROM bilibili_metadata"
				);
				const totalMeta = Number.parseInt(metaCountResult.rows[0]?.count ?? "0", 10);
				appLogger.info(`[DRY-RUN] Would migrate ${totalMeta} metadata records.`);
			}
			if (options.includeSnapshots) {
				const cutoff = await resolveSnapshotCutoff(legacyPool, options.snapshotDays);
				const snapshotCountResult = await legacyPool.query<{ count: string }>(
					"SELECT COUNT(*)::text AS count FROM video_snapshot WHERE created_at >= $1",
					[cutoff]
				);
				const totalSnapshots = Number.parseInt(
					snapshotCountResult.rows[0]?.count ?? "0",
					10
				);
				appLogger.info(
					`[DRY-RUN] Would migrate ${totalSnapshots} snapshot records from the last ${options.snapshotDays} days.`
				);
			}
			return;
		}

		// 2. Migrate Tracking Records in batches
		// Keyset pagination: OFFSET re-scans and re-sorts the whole union on
		// every page, which collapses once the legacy table is large.
		let lastAid = "0";
		let migratedTracking = 0;
		const targetTrackingTotal = options.limit
			? Math.min(totalActive, options.limit)
			: totalActive;

		while (migratedTracking < targetTrackingTotal) {
			const batchLimit = Math.min(options.batchSize, targetTrackingTotal - migratedTracking);
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
			migratedTracking += trackingRows.rows.length;

			lastAid = trackingRows.rows[trackingRows.rows.length - 1].aid;
			appLogger.info(
				`Migrated ${migratedTracking} / ${targetTrackingTotal} tracking records (${Math.round((migratedTracking / targetTrackingTotal) * 100)}%)`
			);
		}

		// 3. Migrate Metadata Records in batches if requested
		if (options.includeMetadata) {
			const metaCountResult = await legacyPool.query<{ count: string }>(
				"SELECT COUNT(*)::text AS count FROM bilibili_metadata"
			);
			const totalMeta = Number.parseInt(metaCountResult.rows[0]?.count ?? "0", 10);
			const targetMetaTotal = options.limit ? Math.min(totalMeta, options.limit) : totalMeta;

			let lastMetaAid = "0";
			let migratedMeta = 0;

			while (migratedMeta < targetMetaTotal) {
				const batchLimit = Math.min(options.batchSize, targetMetaTotal - migratedMeta);
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
				migratedMeta += metaRows.rows.length;
				lastMetaAid = metaRows.rows[metaRows.rows.length - 1].aid;

				appLogger.info(
					`Migrated ${migratedMeta} / ${targetMetaTotal} metadata records (${Math.round((migratedMeta / targetMetaTotal) * 100)}%)`
				);
			}
		}

		// 4. Migrate only the recent Video Snapshots. The legacy table holds 100M+
		// rows, so reads are bounded to the last `snapshotDays` days and paginated
		// with a `(created_at, id)` keyset cursor. `created_at` is indexed on the
		// legacy database, keeping every batch a bounded index range scan.
		let migratedSnapshots = 0;
		if (options.includeSnapshots) {
			const cutoff = await resolveSnapshotCutoff(legacyPool, options.snapshotDays);
			const snapshotCountResult = await legacyPool.query<{ count: string }>(
				"SELECT COUNT(*)::text AS count FROM video_snapshot WHERE created_at >= $1",
				[cutoff]
			);
			const totalSnapshots = Number.parseInt(snapshotCountResult.rows[0]?.count ?? "0", 10);
			const targetSnapshotTotal = options.limit
				? Math.min(totalSnapshots, options.limit)
				: totalSnapshots;
			appLogger.info(
				`Found ${totalSnapshots} snapshot records in the last ${options.snapshotDays} days`
			);

			const snapshotBatchSize = options.batchSize;
			let lastCreatedAt: Date | string = cutoff;
			let lastSnapshotId = 0;

			while (migratedSnapshots < targetSnapshotTotal) {
				const batchLimit = Math.min(
					snapshotBatchSize,
					targetSnapshotTotal - migratedSnapshots
				);
				const snapshotRows: QueryResult<LegacySnapshotRow> =
					await legacyPool.query<LegacySnapshotRow>(
						`
					SELECT
						id,
						aid::text,
						created_at,
						COALESCE(views, 0) AS views,
						COALESCE(coins, 0) AS coins,
						COALESCE(likes, 0) AS likes,
						COALESCE(favorites, 0) AS favorites,
						COALESCE(shares, 0) AS shares,
						COALESCE(danmakus, 0) AS danmakus,
						COALESCE(replies, 0) AS replies
					FROM video_snapshot
					WHERE created_at >= $1
						AND created_at >= $2
						AND (created_at, id) > ($2, $3)
					ORDER BY created_at ASC, id ASC
					LIMIT $4
					`,
						[cutoff, lastCreatedAt, lastSnapshotId, batchLimit]
					);

				if (snapshotRows.rows.length === 0) break;

				await insertSnapshotBatch(snapshotPool, snapshotRows.rows.map(toSnapshotInsertRow));
				migratedSnapshots += snapshotRows.rows.length;

				const lastRow: LegacySnapshotRow = snapshotRows.rows[snapshotRows.rows.length - 1];
				lastCreatedAt = lastRow.created_at;
				lastSnapshotId = lastRow.id;

				appLogger.info(
					`Migrated ${migratedSnapshots} / ${targetSnapshotTotal} snapshot records (${Math.round((migratedSnapshots / targetSnapshotTotal) * 100)}%)`
				);
			}
		}

		appLogger.info("Legacy migration successfully completed!", {
			migratedTracking,
			migratedSnapshots,
		});
	} finally {
		await legacyPool.end();
		await snapshotPool.end();
	}
}

if (import.meta.main) {
	const opts = parseCliArgs();
	runLegacyMigration(opts).catch((error) => {
		appLogger.error("Legacy migration failed", { error });
		process.exit(1);
	});
}
