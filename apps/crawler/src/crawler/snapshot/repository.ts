import { count, desc, eq } from "drizzle-orm";
import { activeTaskResource } from "../shared/taskContext";
import type { DatabaseClient, VideoSnapshot } from "@cvsa/snapshot-db";
import { videoSnapshot } from "@cvsa/snapshot-db";
import { createDatabaseTracer } from "../stats/databaseMetrics";
import type { StatsRecorder } from "../stats/types";
import type { CreateSnapshotInput, ISnapshotRepository } from "./repository.interface";

export class SnapshotRepository implements ISnapshotRepository {
	private readonly trace;
	constructor(
		private readonly db: DatabaseClient,
		stats?: StatsRecorder
	) {
		this.trace = createDatabaseTracer(stats);
	}

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<number> {
		if (snapshots.length === 0) return 0;
		return this.trace("snapshot.createSnapshots", async () => {
			const inserted = await activeTaskResource(this.db)
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
				})
				.returning({ aid: videoSnapshot.aid });
			return inserted.length;
		});
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return this.trace("snapshot.getRecentSnapshots", () =>
			activeTaskResource(this.db)
				.select()
				.from(videoSnapshot)
				.where(eq(videoSnapshot.aid, aid))
				.orderBy(desc(videoSnapshot.capturedAt))
				.limit(limit)
		);
	}

	async listSnapshots(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: VideoSnapshot[]; total: number }> {
		return this.trace("snapshot.listSnapshots", async () => {
			const db = activeTaskResource(this.db);
			const [[{ total }], items] = await Promise.all([
				db.select({ total: count() }).from(videoSnapshot).where(eq(videoSnapshot.aid, aid)),
				db
					.select()
					.from(videoSnapshot)
					.where(eq(videoSnapshot.aid, aid))
					.orderBy(desc(videoSnapshot.capturedAt))
					.limit(options.limit)
					.offset(options.offset),
			]);
			return { items, total };
		});
	}
}
