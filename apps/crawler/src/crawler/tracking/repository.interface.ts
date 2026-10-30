import type { Temporal, VideoTracking } from "@cvsa/snapshot-db";
import type { TrackingScheduleReason, TrackingState } from "./types";

export interface UpsertTrackingInput {
	aid: bigint;
	state?: TrackingState;
	nextSnapshotAt: Temporal.Instant;
	/** Defaults to the row's current value, or `"initial"` for new rows. */
	scheduleReason?: TrackingScheduleReason;
	nextMetadataAt?: Temporal.Instant | null;
	/** `null` releases an in-flight lease. */
	leaseUntil?: Temporal.Instant | null;
	/** `null` clears the previous failure. */
	lastError?: string | null;
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
	nextSnapshotAt?: Temporal.Instant;
	scheduleReason?: TrackingScheduleReason;
	nextMetadataAt?: Temporal.Instant | null;
	/** `null` releases the in-flight lease, which is what a finished job does. */
	leaseUntil?: Temporal.Instant | null;
	/** `null` clears the previous failure. */
	lastError?: string | null;
	lastViews?: number;
	lastCapturedAt?: Temporal.Instant | null;
	velocity?: number;
	targetMilestone?: number | null;
	etaHours?: number | null;
	priority?: number;
	consecutiveFails?: number;
}

export interface ListTrackingVideosParams {
	limit: number;
	offset: number;
	state?: string;
	/**
	 * Free-text filter for the admin console. Numeric terms match the aid
	 * exactly; anything else matches the stored video title.
	 */
	search?: string;
	statusFilter?: "all" | "failing" | "highPriority" | "normal";
	sortBy?:
		| "views"
		| "velocity"
		| "nextSnapshotAt"
		| "consecutiveFails"
		| "publishedAt"
		| "updatedAt";
	sortOrder?: "asc" | "desc";
}

export interface ListTrackingVideosResult {
	items: VideoTracking[];
	total: number;
}

export interface OverdueTrackingSummary {
	overdueCount: number;
	maxOverdueLagSec: number;
}

export interface ITrackingRepository {
	/**
	 * Videos that are due at `beforeTime` (defaults to now) and are not leased by
	 * another in-flight job.
	 */
	findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]>;
	/** Compare-and-set lease acquisition over the given aids. */
	leaseVideos(
		aids: bigint[],
		leaseUntil: Temporal.Instant,
		now?: Temporal.Instant
	): Promise<VideoTracking[]>;
	/**
	 * Claim up to `limit` due videos by leasing them, without touching
	 * `nextSnapshotAt`. The schedule only moves once the job reports back.
	 */
	claimDueVideos(
		now: Temporal.Instant,
		limit: number,
		leaseDurationMs: number
	): Promise<VideoTracking[]>;
	getTracking(aid: bigint): Promise<VideoTracking | null>;
	getTrackings(aids: bigint[]): Promise<VideoTracking[]>;
	upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking>;
	updateSchedule(
		aid: bigint,
		update: UpdateScheduleInput,
		expectedLeaseUntil?: Temporal.Instant
	): Promise<void>;
	/** Release the lease on videos without rescheduling them. */
	releaseLeases(aids: bigint[], expectedLeaseUntil?: Temporal.Instant): Promise<void>;
	postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void>;
	countOverdueVideos(now: Temporal.Instant | Date): Promise<OverdueTrackingSummary>;
	listTrackingVideos(params: ListTrackingVideosParams): Promise<ListTrackingVideosResult>;
	deleteTracking(aid: bigint): Promise<boolean>;
}
