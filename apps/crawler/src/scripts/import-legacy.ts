import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import { createReadStream } from "node:fs";
import { Pool } from "pg";
import {
	DEFAULT_SNAPSHOT_DAYS,
	insertMetadataBatch,
	insertSnapshotBatch,
	type LegacyMetadataRow,
	type LegacySnapshotRow,
	type LegacyTrackingRow,
	type MetadataInsertRow,
	parseSnapshotDays,
	resolveImportBatchSize,
	type SnapshotInsertRow,
	toMetadataInsertRow,
	toSnapshotInsertRow,
	toTrackingInsertRow,
	type TrackingInsertRow,
	upsertTrackingBatch,
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
	let batchSizeArg: string | undefined;
	let includeSnapshots = true;
	let snapshotDays = DEFAULT_SNAPSHOT_DAYS;

	for (const arg of args) {
		if (arg.startsWith("--file=")) {
			file = arg.slice("--file=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSizeArg = arg.slice("--batch-size=".length);
		} else if (arg === "--no-snapshots") {
			includeSnapshots = false;
		} else if (arg.startsWith("--snapshot-days=")) {
			snapshotDays = parseSnapshotDays(arg.slice("--snapshot-days=".length));
		}
	}

	return {
		file,
		batchSize: resolveImportBatchSize(batchSizeArg),
		includeSnapshots,
		snapshotDays,
	};
}

/**
 * The dump is untrusted JSONL, so every field is narrowed instead of cast. A
 * record that cannot yield a usable `aid` is skipped rather than aborting a
 * multi-million-line import.
 */
function asText(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return null;
}

function asNumberish(value: unknown): number | string | null {
	if (typeof value === "number" || typeof value === "string") return value;
	return null;
}

function asDateish(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value;
	if (value instanceof Date) return value.toISOString();
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, lineNumber: number): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`line ${lineNumber}: expected a JSON object`);
	}
	return value;
}

function readTrackingRow(record: Record<string, unknown>, aid: string): LegacyTrackingRow {
	return {
		aid,
		schedule_type: asText(record.schedule_type),
		schedule_started_at: asDateish(record.schedule_started_at),
		current_views: asNumberish(record.current_views),
		velocity: asNumberish(record.velocity),
		eta_hours: asNumberish(record.eta_hours),
		target_milestone: asNumberish(record.target_milestone),
		next_snapshot: asDateish(record.next_snapshot),
		published_at: asDateish(record.published_at),
	};
}

function readMetadataRow(record: Record<string, unknown>, aid: string): LegacyMetadataRow {
	return {
		aid,
		bvid: asText(record.bvid),
		title: asText(record.title),
		description: asText(record.description),
		cover_url: asText(record.cover_url),
		published_at: asDateish(record.published_at),
		duration: asNumberish(record.duration),
		uid: asText(record.uid),
		tags: asText(record.tags),
		created_at: asDateish(record.created_at),
	};
}

function readSnapshotRow(record: Record<string, unknown>, aid: string): LegacySnapshotRow {
	return {
		id: Number(asNumberish(record.id) ?? 0),
		aid,
		created_at: asDateish(record.created_at) ?? "",
		views: Number(asNumberish(record.views) ?? 0),
		coins: Number(asNumberish(record.coins) ?? 0),
		likes: Number(asNumberish(record.likes) ?? 0),
		favorites: Number(asNumberish(record.favorites) ?? 0),
		shares: Number(asNumberish(record.shares) ?? 0),
		danmakus: Number(asNumberish(record.danmakus) ?? 0),
		replies: Number(asNumberish(record.replies) ?? 0),
	};
}

/**
 * Streaming line reader that strictly splits on `\n`.
 *
 * Node/Bun's `readline.createInterface` treats ECMAScript line terminators
 * U+2028 (Line Separator) and U+2029 (Paragraph Separator) as line breaks.
 * Video descriptions frequently contain U+2028/U+2029 (from lyrics copy-pasting),
 * which caused `readline` to slice a single JSON record into broken multi-line fragments.
 */
async function* splitJsonLines(stream: AsyncIterable<Buffer | Uint8Array>): AsyncIterable<string> {
	let buffer = "";
	const decoder = new TextDecoder("utf-8");
	for await (const chunk of stream) {
		buffer += decoder.decode(chunk, { stream: true });
		let start = 0;
		let idx = buffer.indexOf("\n", start);
		while (idx !== -1) {
			yield buffer.slice(start, idx);
			start = idx + 1;
			idx = buffer.indexOf("\n", start);
		}
		buffer = buffer.slice(start);
	}
	buffer += decoder.decode();
	if (buffer.length > 0) {
		yield buffer;
	}
}

async function runImport(): Promise<void> {
	const opts = parseCliArgs();
	appLogger.info("Starting legacy data import from dump file...", {
		file: opts.file,
		batchSize: opts.batchSize,
		includeSnapshots: opts.includeSnapshots,
		snapshotDays: opts.snapshotDays,
	});

	// Writes go through `pg` rather than the ORM: every batch is a single
	// `INSERT ... SELECT FROM jsonb_to_recordset($1)` with one bound parameter,
	// so a 10k-row batch is one statement instead of 10k round trips.
	const pool = new Pool({ connectionString: crawlerEnv.SNAPSHOT_DATABASE_URL });

	let importedTracking = 0;
	let importedMeta = 0;
	let importedSnapshots = 0;
	let skippedSnapshots = 0;
	let skippedRecords = 0;
	let lineNumber = 0;

	let trackingBatch: TrackingInsertRow[] = [];
	let metadataBatch: MetadataInsertRow[] = [];
	let snapshotBatch: SnapshotInsertRow[] = [];

	const now = new Date();
	const snapshotCutoffMs = now.getTime() - opts.snapshotDays * 24 * 60 * 60 * 1_000;

	try {
		for await (const line of splitJsonLines(createReadStream(opts.file))) {
			lineNumber++;
			const trimmed = line.trim();
			if (!trimmed) continue;

			let rawRecord: unknown;
			try {
				rawRecord = JSON.parse(trimmed);
			} catch (parseError) {
				skippedRecords++;
				appLogger.warn(`Skipping malformed JSON line ${lineNumber}`, {
					error: (parseError as Error).message,
				});
				continue;
			}

			const record = readRecord(rawRecord, lineNumber);
			const recordType = asText(record._type);
			const aid = asText(record.aid);
			if (!aid) {
				skippedRecords++;
				continue;
			}

			if (recordType === "tracking") {
				trackingBatch.push(toTrackingInsertRow(readTrackingRow(record, aid), now));
				if (trackingBatch.length >= opts.batchSize) {
					await upsertTrackingBatch(pool, trackingBatch);
					importedTracking += trackingBatch.length;
					trackingBatch = [];
					appLogger.info(`Imported ${importedTracking} tracking records...`);
				}
			} else if (recordType === "metadata") {
				metadataBatch.push(toMetadataInsertRow(readMetadataRow(record, aid), now));
				if (metadataBatch.length >= opts.batchSize) {
					await insertMetadataBatch(pool, metadataBatch);
					importedMeta += metadataBatch.length;
					metadataBatch = [];
					appLogger.info(`Imported ${importedMeta} metadata records...`);
				}
			} else if (recordType === "snapshot" && opts.includeSnapshots) {
				const snapshot = toSnapshotInsertRow(readSnapshotRow(record, aid));
				const capturedAtMs = new Date(snapshot.capturedAt).getTime();
				// The dump is already windowed, but re-checking here keeps a stale
				// or malformed dump file from silently resurrecting old history or
				// failing the batch.
				if (Number.isNaN(capturedAtMs) || capturedAtMs < snapshotCutoffMs) {
					skippedSnapshots++;
					continue;
				}

				snapshotBatch.push(snapshot);
				if (snapshotBatch.length >= opts.batchSize) {
					await insertSnapshotBatch(pool, snapshotBatch);
					importedSnapshots += snapshotBatch.length;
					snapshotBatch = [];
					appLogger.info(`Imported ${importedSnapshots} snapshot records...`);
				}
			}
		}

		if (trackingBatch.length > 0) {
			await upsertTrackingBatch(pool, trackingBatch);
			importedTracking += trackingBatch.length;
		}
		if (metadataBatch.length > 0) {
			await insertMetadataBatch(pool, metadataBatch);
			importedMeta += metadataBatch.length;
		}
		if (snapshotBatch.length > 0) {
			await insertSnapshotBatch(pool, snapshotBatch);
			importedSnapshots += snapshotBatch.length;
		}

		appLogger.info("Legacy dump import successfully finished!", {
			importedTracking,
			importedMeta,
			importedSnapshots,
			skippedSnapshots,
			skippedRecords,
		});
	} finally {
		await pool.end();
	}
}

if (import.meta.main) {
	runImport().catch((error) => {
		appLogger.error("Failed to import legacy data", { error });
		process.exit(1);
	});
}
