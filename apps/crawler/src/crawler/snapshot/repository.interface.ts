import type { Temporal, VideoSnapshot } from "@cvsa/snapshot-db";

export interface CreateSnapshotInput {
	aid: bigint;
	capturedAt?: Temporal.Instant;
	views: number;
	coins: number;
	likes: number;
	favorites: number;
	shares: number;
	danmakus: number;
	replies: number;
}

export interface ISnapshotRepository {
	createSnapshots(snapshots: CreateSnapshotInput[]): Promise<void>;
	getRecentSnapshots(aid: bigint, limit?: number): Promise<VideoSnapshot[]>;
	listSnapshots(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: VideoSnapshot[]; total: number }>;
}
