import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import { snapshotDb, toInstant } from "@cvsa/snapshot-db";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Pool } from "pg";
import { DiscoveryRepository } from "../crawler/discovery/repository";
import type { UpsertMetadataInput } from "../crawler/discovery/types";
import { TrackingRepository } from "../crawler/tracking/repository";
import {
	DEFAULT_SNAPSHOT_DAYS,
	SNAPSHOT_BATCH_SIZE,
	type SnapshotInsertRow,
	insertSnapshotBatch,
	parseSnapshotDays,
} from "./legacy-snapshots";

interface ImportOptions {
	file: string;
	batchSize: number;
	includeSnapshots: boolean;
	snapshotDays: number;
}

function parseCliArgs(): ImportOptions {
	const args = process.argv.slice(2);
	let file = "legacy-tracking-dump.jsonl";
	let batchSize = 1000;
	let includeSnapshots = true;
	let snapshotDays = DEFAULT_SNAPSHOT_DAYS;

	for (const arg of args) {
		if (arg.startsWith("--file=")) {
			file = arg.slice("--file=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSize = Number.parseInt(arg.slice("--batch-size=".length), 10) || 1000;
		} else if (arg === "--no-snapshots") {
			includeSnapshots = false;
		} else if (arg.startsWith("--snapshot-days=")) {
			snapshotDays = parseSnapshotDays(arg.slice("--snapshot-days=".length));
		}
	}

	return { file, batchSize, includeSnapshots, snapshotDays };
}

async function runImport(): Promise<void> {
	const opts = parseCliArgs();
	appLogger.info("Starting legacy data import from dump file...", {
		file: opts.file,
		batchSize: opts.batchSize,
		includeSnapshots: opts.includeSnapshots,
		snapshotDays: opts.snapshotDays,
	});

	await snapshotDb.connect();
	const trackingRepo = new TrackingRepository(snapshotDb.client);
	const discoveryRepo = new DiscoveryRepository(snapshotDb.client);
	// Snapshots go through `pg` so a batch is one multi-row INSERT instead of
	// one ORM call per row.
	const snapshotPool = new Pool({
		connectionString: crawlerEnv.SNAPSHOT_DATABASE_URL,
	});

	const fileStream = createReadStream(opts.file, { encoding: "utf8" });
	const rl = createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let importedTracking = 0;
	let importedMeta = 0;
	let importedSnapshots = 0;
	let skippedSnapshots = 0;
	let metadataBatch: UpsertMetadataInput[] = [];
	let snapshotBatch: SnapshotInsertRow[] = [];
	const snapshotBatchSize = Math.min(opts.batchSize, SNAPSHOT_BATCH_SIZE);

	const now = new Date();
	const snapshotCutoffMs = now.getTime() - opts.snapshotDays * 24 * 60 * 60 * 1_000;

	try {
		for await (const line of rl) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const record = JSON.parse(trimmed);

			if (record._type === "tracking") {
				const aid = BigInt(record.aid);
				const scheduleType = record.schedule_type ?? "normal";
				const state =
					scheduleType === "milestone"
						? "milestone"
						: scheduleType === "new"
							? "new"
							: "regular";

				let nextSnapshotAtDate = now;
				if (record.next_snapshot) {
					const ns = new Date(record.next_snapshot);
					if (!Number.isNaN(ns.getTime())) nextSnapshotAtDate = ns;
				} else if (record.schedule_started_at) {
					const ss = new Date(record.schedule_started_at);
					if (!Number.isNaN(ss.getTime())) nextSnapshotAtDate = ss;
				}

				await trackingRepo.upsertTracking({
					aid,
					state,
					nextSnapshotAt: toInstant(nextSnapshotAtDate),
					lastViews: record.current_views ?? 0,
					velocity: record.velocity ?? 0,
					targetMilestone: record.target_milestone ?? null,
					etaHours: record.eta_hours ?? null,
					publishedAt: record.published_at
						? toInstant(new Date(record.published_at))
						: null,
					priority: state === "milestone" ? 1 : 2,
				});

				importedTracking++;
				if (importedTracking % 1000 === 0) {
					appLogger.info(`Imported ${importedTracking} tracking records...`);
				}
			} else if (record._type === "metadata") {
				const aid = BigInt(record.aid);
				const pubdate = record.published_at
					? toInstant(new Date(record.published_at))
					: null;
				const capturedAt = record.created_at
					? toInstant(new Date(record.created_at))
					: toInstant(new Date());

				let parsedTags: string[] | null = null;
				if (record.tags) {
					parsedTags = record.tags
						.split(",")
						.map((t: string) => t.trim())
						.filter(Boolean);
				}

				metadataBatch.push({
					aid,
					bvid: record.bvid ?? `av${record.aid}`,
					title: record.title ?? "",
					description: record.description ?? null,
					pic: record.cover_url ?? null,
					pubdate,
					duration: record.duration ?? 0,
					mid: record.uid ? BigInt(record.uid) : null,
					tags: parsedTags,
					capturedAt,
				});

				if (metadataBatch.length >= opts.batchSize) {
					await discoveryRepo.bulkUpsertMetadata(metadataBatch);
					importedMeta += metadataBatch.length;
					metadataBatch = [];
					appLogger.info(`Imported ${importedMeta} metadata records...`);
				}
			} else if (record._type === "snapshot" && opts.includeSnapshots) {
				const capturedAt = new Date(record.created_at);
				// The dump is already windowed, but re-checking here keeps a stale
				// dump file from silently resurrecting old history.
				if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() < snapshotCutoffMs) {
					skippedSnapshots++;
					continue;
				}

				snapshotBatch.push({
					aid: record.aid,
					capturedAt: record.created_at,
					views: record.views ?? 0,
					coins: record.coins ?? 0,
					likes: record.likes ?? 0,
					favorites: record.favorites ?? 0,
					shares: record.shares ?? 0,
					danmakus: record.danmakus ?? 0,
					replies: record.replies ?? 0,
				});

				if (snapshotBatch.length >= snapshotBatchSize) {
					await insertSnapshotBatch(snapshotPool, snapshotBatch);
					importedSnapshots += snapshotBatch.length;
					snapshotBatch = [];
					appLogger.info(`Imported ${importedSnapshots} snapshot records...`);
				}
			}
		}

		if (metadataBatch.length > 0) {
			await discoveryRepo.bulkUpsertMetadata(metadataBatch);
			importedMeta += metadataBatch.length;
		}

		if (snapshotBatch.length > 0) {
			await insertSnapshotBatch(snapshotPool, snapshotBatch);
			importedSnapshots += snapshotBatch.length;
		}

		appLogger.info("Legacy dump import successfully finished!", {
			importedTracking,
			importedMeta,
			importedSnapshots,
			skippedSnapshots,
		});
	} finally {
		await snapshotPool.end();
		await snapshotDb.disconnect();
	}
}

if (import.meta.main) {
	runImport().catch((error) => {
		appLogger.error("Failed to import legacy data", { error });
		process.exit(1);
	});
}
