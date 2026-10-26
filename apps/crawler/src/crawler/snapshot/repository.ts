import type { DatabaseClient, VideoSnapshot } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type { CreateSnapshotInput, ISnapshotRepository } from "./repository.interface";

export class SnapshotRepository implements ISnapshotRepository {
	constructor(private readonly db: DatabaseClient) {}

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<void> {
		if (snapshots.length === 0) return;
		await traceTask("snapshot.createSnapshots", async () => {
			await this.db.orm.public.VideoSnapshot.createAll(
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
				})),
				{
					onConflict: "skip",
					conflictOn: ["aid", "capturedAt"],
				}
			);
		});
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return traceTask("snapshot.getRecentSnapshots", () =>
			this.db.orm.public.VideoSnapshot.where({ aid })
				.orderBy((s) => s.capturedAt.desc())
				.limit(limit)
				.all()
		);
	}
}
