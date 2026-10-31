import { desc, eq } from "drizzle-orm";
import { activeTaskResource } from "../shared/taskContext";
import type { DatabaseClient, VideoSnapshot } from "@cvsa/snapshot-db";
import { videoSnapshot } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type { CreateSnapshotInput, ISnapshotRepository } from "./repository.interface";

export class SnapshotRepository implements ISnapshotRepository {
	constructor(private readonly db: DatabaseClient) {}

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<void> {
		if (snapshots.length === 0) return;
		await traceTask("snapshot.createSnapshots", async () => {
			await activeTaskResource(this.db)
				.insert(videoSnapshot)
				.values(
					snapshots.map((s) => ({
						aid: s.aid,
						...(s.capturedAt ? { capturedAt: s.capturedAt } : {}),
						views: s.views,
						coins: s.coins,
						likes: s.likes,
						favorites: s.favorites,
						shares: s.shares,
						danmakus: s.danmakus,
						replies: s.replies,
					}))
				)
				// A retried batch re-delivers rows that were already written.
				.onConflictDoNothing({
					target: [videoSnapshot.aid, videoSnapshot.capturedAt],
				});
		});
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return traceTask("snapshot.getRecentSnapshots", () =>
			activeTaskResource(this.db)
				.select()
				.from(videoSnapshot)
				.where(eq(videoSnapshot.aid, aid))
				.orderBy(desc(videoSnapshot.capturedAt))
				.limit(limit)
		);
	}
}
