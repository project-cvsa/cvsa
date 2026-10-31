import { appLogger } from "@cvsa/logger";
import { createDatabaseClient, song } from "@cvsa/db";
import { and, isNotNull, isNull } from "drizzle-orm";
import { snapshotDb, toInstant } from "@cvsa/snapshot-db";
import { TrackingRepository } from "../crawler/tracking/repository";

async function main(): Promise<void> {
	appLogger.info("Starting video tracking seed from core catalog database...");

	const coreDb = createDatabaseClient();
	await snapshotDb.connect();
	const trackingRepo = new TrackingRepository(snapshotDb.client);

	const songs = await coreDb
		.select()
		.from(song)
		.where(and(isNotNull(song.bilibiliAid), isNull(song.deletedAt)));

	appLogger.info(`Found ${songs.length} songs with Bilibili aid in core catalog`);

	let seeded = 0;
	const now = toInstant(new Date());

	for (const row of songs) {
		if (!row.bilibiliAid) continue;
		await trackingRepo.upsertTracking({
			aid: row.bilibiliAid,
			state: "regular",
			nextSnapshotAt: now,
			publishedAt: row.publishedAt ? toInstant(row.publishedAt) : null,
			priority: 2,
		});
		seeded++;
	}

	appLogger.info(`Successfully seeded ${seeded} videos into video_tracking`);
	await snapshotDb.disconnect();
	await coreDb.$client.close();
}

if (import.meta.main) {
	main().catch((error) => {
		appLogger.error("Failed to seed video tracking", { error });
		process.exit(1);
	});
}
