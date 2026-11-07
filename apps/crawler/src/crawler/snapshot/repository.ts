import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { activeDatabase } from "../shared/databaseContext";
import type {
	DatabaseClient,
	LatestVideoSnapshot,
	VideoSnapshot,
	Temporal,
} from "@cvsa/snapshot-db";
import { latestVideoSnapshot, videoSnapshot, toInstant } from "@cvsa/snapshot-db";
import { MILESTONE_HISTORY_WINDOWS_MS } from "../tracking/scheduler";
import { createDatabaseTracer } from "../stats/databaseMetrics";
import type { StatsRecorder } from "../stats/types";
import type { CreateSnapshotInput, ISnapshotRepository } from "./repository.interface";

export class SnapshotRepository implements ISnapshotRepository {
	private readonly trace;
	constructor(
		private readonly db: DatabaseClient,
		stats?: StatsRecorder
	) {
		this.trace = createDatabaseTracer(stats, "snapshot");
	}

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<number> {
		if (snapshots.length === 0) return 0;
		return this.trace("snapshot.createSnapshots", async () => {
			const inserted = await activeDatabase(this.db)
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

	async getLatestSnapshot(aid: bigint): Promise<LatestVideoSnapshot | null> {
		return this.trace("snapshot.getLatestSnapshot", async () => {
			const [row] = await activeDatabase(this.db)
				.select()
				.from(latestVideoSnapshot)
				.where(eq(latestVideoSnapshot.aid, aid))
				.limit(1);
			return row ?? null;
		});
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return this.trace("snapshot.getRecentSnapshots", () =>
			activeDatabase(this.db)
				.select()
				.from(videoSnapshot)
				.where(eq(videoSnapshot.aid, aid))
				.orderBy(desc(videoSnapshot.capturedAt))
				.limit(limit)
		);
	}
	async getSchedulingHistory(aid: bigint, at: Temporal.Instant): Promise<VideoSnapshot[]> {
		return this.trace("snapshot.getSchedulingHistory", async () => {
			const db = activeDatabase(this.db);
			// Bind lower bound to 7 days to enable TimescaleDB chunk pruning and avoid historical decompression
			const sevenDaysAgo = toInstant(
				new Date(at.epochMilliseconds - 7 * 24 * 60 * 60 * 1000)
			);
			const windows = await Promise.all(
				MILESTONE_HISTORY_WINDOWS_MS.map(async (windowMs) => {
					const [row] = await db
						.select()
						.from(videoSnapshot)
						.where(
							and(
								eq(videoSnapshot.aid, aid),
								gte(videoSnapshot.capturedAt, sevenDaysAgo),
								lte(
									videoSnapshot.capturedAt,
									toInstant(new Date(at.epochMilliseconds - windowMs))
								)
							)
						)
						.orderBy(desc(videoSnapshot.capturedAt))
						.limit(1);
					return row;
				})
			);
			return windows.filter((row): row is VideoSnapshot => row !== undefined);
		});
	}

	async listSnapshots(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: VideoSnapshot[]; total: number }> {
		return this.trace("snapshot.listSnapshots", async () => {
			const db = activeDatabase(this.db);
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
