import { appLogger } from "@cvsa/logger";
import { createWriteStream } from "node:fs";
import { Pool, type QueryResult } from "pg";
import {
	DEFAULT_SNAPSHOT_DAYS,
	type LegacyMetadataRow,
	type LegacySnapshotRow,
	type LegacyTrackingRow,
	parseSnapshotDays,
	resolveImportBatchSize,
	resolveSnapshotCutoff,
} from "./legacy-snapshots";

interface DumpOptions {
	legacyDbUrl: string;
	outFile: string;
	batchSize: number;
	includeSnapshots: boolean;
	snapshotDays: number;
	limit?: number;
}

function parseCliArgs(): DumpOptions {
	const args = process.argv.slice(2);
	let legacyDbUrl = process.env.LEGACY_DATABASE_URL ?? "";
	let outFile = "legacy-tracking-dump.jsonl";
	let batchSize = resolveImportBatchSize(undefined);
	let includeSnapshots = true;
	let snapshotDays = DEFAULT_SNAPSHOT_DAYS;
	let limit: number | undefined;

	for (const arg of args) {
		if (arg.startsWith("--legacy-db=")) {
			legacyDbUrl = arg.slice("--legacy-db=".length);
		} else if (arg.startsWith("--out=")) {
			outFile = arg.slice("--out=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSize = resolveImportBatchSize(arg.slice("--batch-size=".length));
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

	return { legacyDbUrl, outFile, batchSize, includeSnapshots, snapshotDays, limit };
}

async function runDump(): Promise<void> {
	const opts = parseCliArgs();
	appLogger.info("Starting legacy data export dump...", {
		outFile: opts.outFile,
		batchSize: opts.batchSize,
		includeSnapshots: opts.includeSnapshots,
		snapshotDays: opts.snapshotDays,
		limit: opts.limit,
	});

	const pool = new Pool({
		connectionString: opts.legacyDbUrl,
	});

	const outStream = createWriteStream(opts.outFile, { encoding: "utf8" });

	try {
		await pool.query("SELECT 1");
		appLogger.info("Connected to local legacy PostgreSQL");

		// 1. Export Active Tracking Records
		const trackingCount = await pool.query<{ count: string }>(`
			WITH active_aids AS (
				SELECT aid FROM songs WHERE deleted = false AND aid IS NOT NULL
				UNION
				SELECT aid FROM snapshot_schedule WHERE status IN ('pending', 'processing')
				UNION
				SELECT aid FROM eta WHERE aid IS NOT NULL
			)
			SELECT COUNT(*)::text AS count FROM active_aids
		`);

		const totalActive = Number.parseInt(trackingCount.rows[0]?.count ?? "0", 10);
		const targetTotal = opts.limit ? Math.min(totalActive, opts.limit) : totalActive;
		appLogger.info(`Found ${totalActive} active tracking candidates to dump`);

		// Keyset pagination: OFFSET re-scans and re-sorts the whole union on every
		// page, which collapses on a legacy table of this size. `aid` is the
		// primary key of every branch, so `aid > cursor` is an index seek.
		let lastAid = "0";
		let dumpedTracking = 0;

		while (dumpedTracking < targetTotal) {
			const batchLimit = Math.min(opts.batchSize, targetTotal - dumpedTracking);
			const rows = await pool.query<LegacyTrackingRow>(
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

			if (rows.rows.length === 0) break;

			for (const row of rows.rows) {
				const record = {
					_type: "tracking",
					...row,
				};
				outStream.write(`${JSON.stringify(record)}\n`);
				dumpedTracking++;
			}

			lastAid = rows.rows[rows.rows.length - 1].aid;

			appLogger.info(`Dumped ${dumpedTracking} / ${targetTotal} tracking records`);
		}

		// 2. Export Video Metadata
		const metaCount = await pool.query<{ count: string }>(
			"SELECT COUNT(*)::text AS count FROM bilibili_metadata"
		);
		const totalMeta = Number.parseInt(metaCount.rows[0]?.count ?? "0", 10);
		const targetMeta = opts.limit ? Math.min(totalMeta, opts.limit) : totalMeta;
		appLogger.info(`Found ${totalMeta} metadata records to dump`);

		let lastMetaAid = "0";
		let dumpedMeta = 0;

		while (dumpedMeta < targetMeta) {
			const batchLimit = Math.min(opts.batchSize, targetMeta - dumpedMeta);
			const rows = await pool.query<LegacyMetadataRow>(
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

			if (rows.rows.length === 0) break;

			for (const row of rows.rows) {
				const record = {
					_type: "metadata",
					...row,
				};
				outStream.write(`${JSON.stringify(record)}\n`);
				dumpedMeta++;
			}

			lastMetaAid = rows.rows[rows.rows.length - 1].aid;
			appLogger.info(`Dumped ${dumpedMeta} / ${targetMeta} metadata records`);
		}

		// 3. Export only the recent Video Snapshots. The legacy table holds 100M+
		// rows, so the dump is bounded to the last `snapshotDays` days and read
		// with a `(created_at, id)` keyset cursor. `created_at` is indexed on the
		// legacy database, so every batch is a bounded index range scan instead of
		// a full-table walk.
		let dumpedSnapshots = 0;
		if (opts.includeSnapshots) {
			const cutoff = await resolveSnapshotCutoff(pool, opts.snapshotDays);
			const snapshotCount = await pool.query<{ count: string }>(
				"SELECT COUNT(*)::text AS count FROM video_snapshot WHERE created_at >= $1",
				[cutoff]
			);
			const totalSnapshots = Number.parseInt(snapshotCount.rows[0]?.count ?? "0", 10);
			const targetSnapshots = opts.limit
				? Math.min(totalSnapshots, opts.limit)
				: totalSnapshots;
			appLogger.info(
				`Found ${totalSnapshots} snapshot records in the last ${opts.snapshotDays} days to dump`
			);

			const snapshotBatchSize = opts.batchSize;
			let lastCreatedAt: Date | string = cutoff;
			let lastSnapshotId = 0;

			while (dumpedSnapshots < targetSnapshots) {
				const batchLimit = Math.min(snapshotBatchSize, targetSnapshots - dumpedSnapshots);
				const rows: QueryResult<LegacySnapshotRow> = await pool.query<LegacySnapshotRow>(
					`
					SELECT
						id,
						aid::text,
						created_at,
						views,
						coins,
						likes,
						favorites,
						shares,
						danmakus,
						replies
					FROM video_snapshot
					WHERE created_at >= $1
						AND created_at >= $2
						AND (created_at, id) > ($2, $3)
					ORDER BY created_at ASC, id ASC
					LIMIT $4
					`,
					[cutoff, lastCreatedAt, lastSnapshotId, batchLimit]
				);

				if (rows.rows.length === 0) break;

				for (const row of rows.rows) {
					const record = {
						_type: "snapshot",
						...row,
					};
					outStream.write(`${JSON.stringify(record)}\n`);
					dumpedSnapshots++;
				}

				const lastRow: LegacySnapshotRow = rows.rows[rows.rows.length - 1];
				lastCreatedAt = lastRow.created_at;
				lastSnapshotId = lastRow.id;
				appLogger.info(`Dumped ${dumpedSnapshots} / ${targetSnapshots} snapshot records`);
			}
		}

		await new Promise<void>((resolve, reject) => {
			outStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
		});

		appLogger.info("Legacy dump completed successfully!", {
			outFile: opts.outFile,
			dumpedTracking,
			dumpedMeta,
			dumpedSnapshots,
		});
	} finally {
		await pool.end();
	}
}

if (import.meta.main) {
	runDump().catch((error) => {
		appLogger.error("Failed to dump legacy data", { error });
		process.exit(1);
	});
}
