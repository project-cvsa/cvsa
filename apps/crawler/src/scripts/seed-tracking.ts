import { appLogger } from "@cvsa/logger";
import { createDatabaseClient } from "@cvsa/db";
import { snapshotDb, toInstant } from "@cvsa/snapshot-db";
import { TrackingRepository } from "../crawler/tracking/repository";

async function main(): Promise<void> {
	appLogger.info("Starting video tracking seed from core catalog database...");

	const coreDb = createDatabaseClient();
	await snapshotDb.connect();
	const trackingRepo = new TrackingRepository(snapshotDb.client);

	const songs = await coreDb.orm.core.Song.where((s) => s.bilibiliAid.isNotNull())
		.where({ deletedAt: null })
		.all();

	appLogger.info(`Found ${songs.length} songs with Bilibili aid in core catalog`);

	let seeded = 0;
	const now = toInstant(new Date());

	for (const song of songs) {
		if (!song.bilibiliAid) continue;
		await trackingRepo.upsertTracking({
			aid: song.bilibiliAid,
			state: "regular",
			nextSnapshotAt: now,
			publishedAt: song.publishedAt ? toInstant(song.publishedAt) : null,
			priority: 2,
		});
		seeded++;
	}

	appLogger.info(`Successfully seeded ${seeded} videos into video_tracking`);
	await snapshotDb.disconnect();
	await coreDb.close();
}

if (import.meta.main) {
	main().catch((error) => {
		appLogger.error("Failed to seed video tracking", { error });
		process.exit(1);
	});
}
