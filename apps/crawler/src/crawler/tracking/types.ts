export type TrackingState = "new" | "regular" | "milestone" | "archive";

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
	targetMilestone?: number | null;
	consecutiveFails?: number;
	recentSnapshots?: SnapshotSample[];
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
