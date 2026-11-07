import type { LatestVideoSnapshot, Temporal, VideoSnapshot } from "@cvsa/snapshot-db";

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
	createSnapshots(snapshots: CreateSnapshotInput[]): Promise<number>;
	getLatestSnapshot(aid: bigint): Promise<LatestVideoSnapshot | null>;
	getRecentSnapshots(aid: bigint, limit?: number): Promise<VideoSnapshot[]>;
	getSchedulingHistory(aid: bigint, at: Temporal.Instant): Promise<VideoSnapshot[]>;
	getSchedulingHistories?(
		aids: bigint[],
		at: Temporal.Instant
	): Promise<Map<bigint, VideoSnapshot[]>>;
	listSnapshots(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: VideoSnapshot[]; total: number }>;
}
