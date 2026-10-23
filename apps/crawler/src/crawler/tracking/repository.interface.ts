import type { Temporal, VideoTracking } from "@cvsa/snapshot-db";
import type { TrackingState } from "./types";

export interface UpsertTrackingInput {
	aid: bigint;
	state?: TrackingState;
	nextSnapshotAt: Temporal.Instant;
	lastViews?: number;
	lastCapturedAt?: Temporal.Instant | null;
	velocity?: number;
	targetMilestone?: number | null;
	etaHours?: number | null;
	publishedAt?: Temporal.Instant | null;
	priority?: number;
	consecutiveFails?: number;
}

export interface UpdateScheduleInput {
	state?: TrackingState;
	nextSnapshotAt: Temporal.Instant;
	lastViews?: number;
	lastCapturedAt?: Temporal.Instant | null;
	velocity?: number;
	targetMilestone?: number | null;
	etaHours?: number | null;
	priority?: number;
	consecutiveFails?: number;
}

export interface ITrackingRepository {
	findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]>;
	getTracking(aid: bigint): Promise<VideoTracking | null>;
	getTrackings(aids: bigint[]): Promise<VideoTracking[]>;
	upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking>;
	updateSchedule(aid: bigint, update: UpdateScheduleInput): Promise<void>;
	postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void>;
}
