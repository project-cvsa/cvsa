import { getClosetMilestone, getMilestoneEtaFactor } from "./milestone";
import type { NextScheduleResult, SnapshotSample, VideoTrackingContext } from "./types";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toEpochMs(value: Date | number | null | undefined): number | undefined {
	if (value === null || value === undefined) return undefined;
	return value instanceof Date ? value.getTime() : value;
}

/**
 * Calculates view velocity (views per hour) between two observations.
 */
export function calculateVelocity(
	currentViews: number,
	currentTimeMs: number,
	previousViews?: number,
	previousTimeMs?: number | null
): number {
	if (
		previousViews === undefined ||
		previousTimeMs === null ||
		previousTimeMs === undefined ||
		currentTimeMs <= previousTimeMs
	) {
		return 0;
	}

	const hoursDiff = (currentTimeMs - previousTimeMs) / HOUR;
	if (hoursDiff <= 0) return 0;

	const viewDelta = Math.max(0, currentViews - previousViews);
	return viewDelta / hoursDiff;
}

/**
 * Evaluates short-term milestone ETA using multi-scale historical windows.
 */
export function calculateMilestoneEta(
	currentViews: number,
	currentTimeMs: number,
	recentSnapshots: SnapshotSample[]
): {
	targetMilestone: number;
	etaHours: number;
	adjustedEtaHours: number;
	maxVelocity: number;
} | null {
	const targetMilestone = getClosetMilestone(currentViews);
	const viewsRemaining = targetMilestone - currentViews;
	if (viewsRemaining <= 0) return null;

	const factor = getMilestoneEtaFactor(viewsRemaining);
	const sortedSnapshots = [...recentSnapshots]
		.map((s) => ({
			timeMs: toEpochMs(s.capturedAt) ?? 0,
			views: s.views,
		}))
		.filter((s) => s.timeMs < currentTimeMs && s.views <= currentViews)
		.sort((a, b) => b.timeMs - a.timeMs);

	if (sortedSnapshots.length === 0) return null;

	const windows = [3 * MINUTE, 20 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 72 * HOUR];
	let minAdjustedEta = Infinity;
	let maxVelocity = 0;

	for (const windowMs of windows) {
		const targetTime = currentTimeMs - windowMs;
		// Find closest snapshot near targetTime
		let closest: (typeof sortedSnapshots)[0] | undefined;
		let minDiff = Infinity;
		for (const snapshot of sortedSnapshots) {
			const diff = Math.abs(snapshot.timeMs - targetTime);
			if (diff < minDiff) {
				minDiff = diff;
				closest = snapshot;
			}
		}

		if (!closest) continue;
		const hoursDiff = (currentTimeMs - closest.timeMs) / HOUR;
		if (hoursDiff <= 0) continue;

		const viewsDiff = currentViews - closest.views;
		if (viewsDiff <= 0) continue;

		const speed = viewsDiff / hoursDiff;
		const eta = viewsRemaining / speed;
		const adjustedEta = eta / factor;

		if (adjustedEta < minAdjustedEta) {
			minAdjustedEta = adjustedEta;
			maxVelocity = speed;
		}
	}

	if (!Number.isFinite(minAdjustedEta) || maxVelocity <= 0) {
		return null;
	}

	const rawEta = viewsRemaining / maxVelocity;
	return {
		targetMilestone,
		etaHours: rawEta,
		adjustedEtaHours: minAdjustedEta,
		maxVelocity,
	};
}

/**
 * Pure function scheduler evaluating the next snapshot state, timestamp, and priority.
 */
export function evaluateNextSchedule(context: VideoTrackingContext): NextScheduleResult {
	const now = toEpochMs(context.currentTime) ?? Date.now();
	const lastCapturedAt = toEpochMs(context.lastCapturedAt);
	const publishedAt = toEpochMs(context.publishedAt);
	const consecutiveFails = context.consecutiveFails ?? 0;

	// Handle error backoff
	if (consecutiveFails > 0) {
		const backoffMs = Math.min(DAY, 5 * MINUTE * 2 ** Math.min(consecutiveFails - 1, 6));
		return {
			nextState: consecutiveFails >= 10 ? "archive" : context.currentState,
			nextSnapshotAt: new Date(now + backoffMs),
			velocity: 0,
			priority: 3,
			consecutiveFails,
			reason:
				consecutiveFails >= 10 ? "max_retries_exceeded_archived" : "error_retry_backoff",
		};
	}

	// Calculate velocity
	let velocity = calculateVelocity(
		context.currentViews,
		now,
		context.previousViews,
		lastCapturedAt
	);

	// Multi-window milestone calculation
	const milestoneInfo =
		context.recentSnapshots && context.recentSnapshots.length > 0
			? calculateMilestoneEta(context.currentViews, now, context.recentSnapshots)
			: null;

	if (milestoneInfo && milestoneInfo.maxVelocity > velocity) {
		velocity = milestoneInfo.maxVelocity;
	}

	// 1. STATE: MILESTONE
	if (context.currentState === "milestone") {
		const targetMilestone =
			context.targetMilestone ??
			milestoneInfo?.targetMilestone ??
			getClosetMilestone(context.currentViews);

		if (context.currentViews >= targetMilestone) {
			// Targeted milestone achieved! Transition back to regular
			return {
				nextState: "regular",
				nextSnapshotAt: new Date(now + 1 * HOUR),
				velocity,
				targetMilestone: null,
				etaHours: 0,
				priority: 2,
				consecutiveFails: 0,
				reason: "milestone_achieved",
			};
		}

		if (
			!milestoneInfo ||
			milestoneInfo.adjustedEtaHours > 144 ||
			milestoneInfo.maxVelocity <= 0
		) {
			// ETA too far away or decelerated -> demote to regular
			return {
				nextState: "regular",
				nextSnapshotAt: new Date(now + 3 * HOUR),
				velocity,
				targetMilestone: null,
				etaHours: milestoneInfo?.etaHours ?? null,
				priority: 2,
				consecutiveFails: 0,
				reason: "milestone_eta_exceeded_144h",
			};
		}

		// Milestone sprint: interval bounded between 2 seconds and 1 hour
		const sprintDelayMs = Math.max(
			2 * SECOND,
			Math.min(HOUR, Math.round(milestoneInfo.adjustedEtaHours * HOUR))
		);
		return {
			nextState: "milestone",
			nextSnapshotAt: new Date(now + sprintDelayMs),
			velocity,
			targetMilestone: milestoneInfo.targetMilestone,
			etaHours: milestoneInfo.etaHours,
			priority: 1,
			consecutiveFails: 0,
			reason: "milestone_sprint",
		};
	}

	// 2. STATE: NEW
	if (context.currentState === "new") {
		if (publishedAt) {
			const timeSincePublished = now - publishedAt;
			if (timeSincePublished > 48 * HOUR) {
				return {
					nextState: "regular",
					nextSnapshotAt: new Date(now + 2 * HOUR),
					velocity,
					priority: 2,
					consecutiveFails: 0,
					reason: "new_period_expired_48h",
				};
			}
			if (timeSincePublished > 2 * HOUR && velocity < 10) {
				return {
					nextState: "regular",
					nextSnapshotAt: new Date(now + 6 * HOUR),
					velocity,
					priority: 3,
					consecutiveFails: 0,
					reason: "new_video_low_velocity_regularized",
				};
			}
		}

		let intervalMs = 240 * MINUTE;
		let priority = 2;
		if (velocity > 1000) {
			intervalMs = 15 * MINUTE;
			priority = 1;
		} else if (velocity > 100) {
			intervalMs = 60 * MINUTE;
			priority = 1;
		} else if (velocity > 50) {
			intervalMs = 120 * MINUTE;
			priority = 2;
		}

		return {
			nextState: "new",
			nextSnapshotAt: new Date(now + intervalMs),
			velocity,
			priority,
			consecutiveFails: 0,
			reason: "new_video_tracking",
		};
	}

	// 3. STATE: ARCHIVE
	if (context.currentState === "archive") {
		// If video gained notable velocity, revive back to regular
		if (velocity > 10) {
			return {
				nextState: "regular",
				nextSnapshotAt: new Date(now + 2 * HOUR),
				velocity,
				priority: 2,
				consecutiveFails: 0,
				reason: "archive_revived_due_to_velocity",
			};
		}

		return {
			nextState: "archive",
			nextSnapshotAt: new Date(now + 7 * DAY),
			velocity,
			priority: 4,
			consecutiveFails: 0,
			reason: "archive_periodic_sample",
		};
	}

	// 4. STATE: REGULAR
	// Check if video should promote to milestone
	if (milestoneInfo && milestoneInfo.adjustedEtaHours <= 144 && milestoneInfo.maxVelocity > 0) {
		const sprintDelayMs = Math.max(
			2 * SECOND,
			Math.min(HOUR, Math.round(milestoneInfo.adjustedEtaHours * HOUR))
		);
		return {
			nextState: "milestone",
			nextSnapshotAt: new Date(now + sprintDelayMs),
			velocity,
			targetMilestone: milestoneInfo.targetMilestone,
			etaHours: milestoneInfo.etaHours,
			priority: 1,
			consecutiveFails: 0,
			reason: "promoted_to_milestone",
		};
	}

	// Normal regular speed tiers
	let intervalMs: number;
	let priority: number;

	if (velocity > 1000) {
		intervalMs = 1 * HOUR;
		priority = 2;
	} else if (velocity > 200) {
		intervalMs = 3 * HOUR;
		priority = 2;
	} else if (velocity > 50) {
		intervalMs = 6 * HOUR;
		priority = 2;
	} else if (velocity > 10) {
		intervalMs = 12 * HOUR;
		priority = 3;
	} else if (velocity > 1) {
		intervalMs = 24 * HOUR;
		priority = 3;
	} else {
		// Low activity
		const isOld = publishedAt ? now - publishedAt > 30 * DAY : false;
		if (isOld && velocity <= 0.2) {
			return {
				nextState: "archive",
				nextSnapshotAt: new Date(now + 7 * DAY),
				velocity,
				priority: 4,
				consecutiveFails: 0,
				reason: "regular_demoted_to_archive",
			};
		}
		intervalMs = 48 * HOUR;
		priority = 3;
	}

	return {
		nextState: "regular",
		nextSnapshotAt: new Date(now + intervalMs),
		velocity,
		priority,
		consecutiveFails: 0,
		reason: "regular_tracking",
	};
}
