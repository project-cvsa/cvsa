import type {
	TrackingFailureKind as ContractTrackingFailureKind,
	TrackingPolicyConfig as ContractTrackingPolicyConfig,
} from "@cvsa/contracts/crawler/policies";

export type {
	RegularSpeedTier,
	TrackingFailureKind,
	TrackingPolicyConfig,
} from "@cvsa/contracts/crawler/policies";

export type TrackingState = "new" | "regular" | "milestone" | "archive";

/**
 * Why a row was (re)scheduled. Persisted on `video_tracking.schedule_reason` so
 * the admin console can tell a healthy cadence apart from a retry storm without
 * replaying the scheduler.
 */
export type TrackingScheduleReason =
	| "initial"
	| "regular"
	| "milestone"
	| "archive_recheck"
	| "retry";

export const TRACKING_SCHEDULE_REASONS: readonly TrackingScheduleReason[] = [
	"initial",
	"regular",
	"milestone",
	"archive_recheck",
	"retry",
];

/**
 * How long after a snapshot the full metadata payload should be refreshed.
 * Metadata is far more expensive than a stats sample, so it is refreshed on a
 * state-dependent cadence: hot/new videos daily, regular videos weekly, and
 * dormant archive entries monthly.
 */
export const METADATA_REFRESH_INTERVAL_MS: Readonly<Record<TrackingState, number>> = {
	new: 24 * 60 * 60 * 1_000,
	regular: 7 * 24 * 60 * 60 * 1_000,
	milestone: 24 * 60 * 60 * 1_000,
	archive: 30 * 24 * 60 * 60 * 1_000,
};

export interface SnapshotSample {
	capturedAt: Date | number;
	views: number;
}

export interface VideoTrackingContext {
	aid: bigint | number;
	currentState: TrackingState;
	currentViews: number;
	currentTime: Date | number;
	previousViews?: number;
	lastCapturedAt?: Date | number | null;
	publishedAt?: Date | number | null;
	/** Time the video was accepted into tracking. It is independent from publication time. */
	acceptedAt?: Date | number | null;
	targetMilestone?: number | null;
	consecutiveFails?: number;
	/** Missing values are treated as transient failures for backwards compatibility. */
	failureKind?: ContractTrackingFailureKind;
	recentSnapshots?: SnapshotSample[];
	policy?: ContractTrackingPolicyConfig;
}

export interface NextScheduleResult {
	nextState: TrackingState;
	nextSnapshotAt: Date;
	velocity: number; // views per hour
	targetMilestone?: number | null;
	etaHours?: number | null;
	priority: number;
	consecutiveFails: number;
	reason: string;
}
