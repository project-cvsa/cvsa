import { appLogger } from "@cvsa/logger";
import { createWriteStream } from "node:fs";
import { Pool } from "pg";
import { type LegacySnapshotRow, SNAPSHOT_BATCH_SIZE } from "./legacy-snapshots";

interface DumpOptions {
	legacyDbUrl: string;
	outFile: string;
	batchSize: number;
	includeSnapshots: boolean;
	limit?: number;
}

function parseCliArgs(): DumpOptions {
	const args = process.argv.slice(2);
	let legacyDbUrl =
		process.env.LEGACY_DATABASE_URL ??
		"postgres://postgres:KfXtLJgu4oettqmDC4@localhost:5432/cvsa_main";
	let outFile = "legacy-tracking-dump.jsonl";
	let batchSize = 2000;
	let includeSnapshots = true;
	let limit: number | undefined;

	for (const arg of args) {
		if (arg.startsWith("--legacy-db=")) {
			legacyDbUrl = arg.slice("--legacy-db=".length);
		} else if (arg.startsWith("--out=")) {
			outFile = arg.slice("--out=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSize = Number.parseInt(arg.slice("--batch-size=".length), 10) || 2000;
		} else if (arg === "--no-snapshots") {
			includeSnapshots = false;
		} else if (arg.startsWith("--limit=")) {
			limit = Number.parseInt(arg.slice("--limit=".length), 10);
		}
	}

	return { legacyDbUrl, outFile, batchSize, includeSnapshots, limit };
}

async function runDump(): Promise<void> {
	const opts = parseCliArgs();
	appLogger.info("Starting legacy data export dump...", {
		outFile: opts.outFile,
		batchSize: opts.batchSize,
		includeSnapshots: opts.includeSnapshots,
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

		let offset = 0;
		let dumpedTracking = 0;

		while (offset < targetTotal) {
			const batchLimit = Math.min(opts.batchSize, targetTotal - offset);
			const rows = await pool.query(
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
				ORDER BY a.aid ASC
				LIMIT $1 OFFSET $2
			`,
				[batchLimit, offset]
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

			offset += rows.rows.length;
			appLogger.info(`Dumped ${dumpedTracking} / ${targetTotal} tracking records`);
		}

		// 2. Export Video Metadata
		const metaCount = await pool.query<{ count: string }>(
			"SELECT COUNT(*)::text AS count FROM bilibili_metadata"
		);
		const totalMeta = Number.parseInt(metaCount.rows[0]?.count ?? "0", 10);
		const targetMeta = opts.limit ? Math.min(totalMeta, opts.limit) : totalMeta;
		appLogger.info(`Found ${totalMeta} metadata records to dump`);

		let metaOffset = 0;
		let dumpedMeta = 0;

		while (metaOffset < targetMeta) {
			const batchLimit = Math.min(opts.batchSize, targetMeta - metaOffset);
			const rows = await pool.query(
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
				ORDER BY aid ASC
				LIMIT $1 OFFSET $2
			`,
				[batchLimit, metaOffset]
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

			metaOffset += rows.rows.length;
			appLogger.info(`Dumped ${dumpedMeta} / ${targetMeta} metadata records`);
		}

		// 3. Export Video Snapshots with keyset pagination. `id` is the legacy
		// sequence, so a million-row table streams batch by batch instead of
		// holding every offset-scanned page or the whole result set in memory.
		let dumpedSnapshots = 0;
		if (opts.includeSnapshots) {
			const snapshotCount = await pool.query<{ count: string }>(
				"SELECT COUNT(*)::text AS count FROM video_snapshot"
			);
			const totalSnapshots = Number.parseInt(snapshotCount.rows[0]?.count ?? "0", 10);
			const targetSnapshots = opts.limit
				? Math.min(totalSnapshots, opts.limit)
				: totalSnapshots;
			appLogger.info(`Found ${totalSnapshots} snapshot records to dump`);

			const snapshotBatchSize = Math.min(opts.batchSize, SNAPSHOT_BATCH_SIZE);
			let lastSnapshotId = 0;

			while (dumpedSnapshots < targetSnapshots) {
				const batchLimit = Math.min(snapshotBatchSize, targetSnapshots - dumpedSnapshots);
				const rows = await pool.query<LegacySnapshotRow>(
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
					WHERE id > $1
					ORDER BY id ASC
					LIMIT $2
					`,
					[lastSnapshotId, batchLimit]
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

				lastSnapshotId = rows.rows[rows.rows.length - 1].id;
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
