import { appLogger } from "@cvsa/logger";
import { snapshotDb, toInstant } from "@cvsa/snapshot-db";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { DiscoveryRepository } from "../crawler/discovery/repository";
import type { UpsertMetadataInput } from "../crawler/discovery/types";
import { TrackingRepository } from "../crawler/tracking/repository";

interface ImportOptions {
	file: string;
	batchSize: number;
}

function parseCliArgs(): ImportOptions {
	const args = process.argv.slice(2);
	let file = "legacy-tracking-dump.jsonl";
	let batchSize = 1000;

	for (const arg of args) {
		if (arg.startsWith("--file=")) {
			file = arg.slice("--file=".length);
		} else if (arg.startsWith("--batch-size=")) {
			batchSize = Number.parseInt(arg.slice("--batch-size=".length), 10) || 1000;
		}
	}

	return { file, batchSize };
}

async function runImport(): Promise<void> {
	const opts = parseCliArgs();
	appLogger.info("Starting legacy data import from dump file...", {
		file: opts.file,
		batchSize: opts.batchSize,
	});

	await snapshotDb.connect();
	const trackingRepo = new TrackingRepository(snapshotDb.client);
	const discoveryRepo = new DiscoveryRepository(snapshotDb.client);

	const fileStream = createReadStream(opts.file, { encoding: "utf8" });
	const rl = createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let importedTracking = 0;
	let importedMeta = 0;
	let metadataBatch: UpsertMetadataInput[] = [];

	const now = new Date();

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
			}
		}

		if (metadataBatch.length > 0) {
			await discoveryRepo.bulkUpsertMetadata(metadataBatch);
			importedMeta += metadataBatch.length;
		}

		appLogger.info("Legacy dump import successfully finished!", {
			importedTracking,
			importedMeta,
		});
	} finally {
		await snapshotDb.disconnect();
	}
}

if (import.meta.main) {
	runImport().catch((error) => {
		appLogger.error("Failed to import legacy data", { error });
		process.exit(1);
	});
}
