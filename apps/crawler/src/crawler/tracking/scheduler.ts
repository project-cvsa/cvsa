import { getClosetMilestone, getMilestoneEtaFactor } from "./milestone";
import { getNextInitialSampleAt, resolveTrackingPolicy } from "./policy";
import type {
	NextScheduleResult,
	SnapshotSample,
	TrackingPolicyConfig,
	TrackingScheduleReason,
	TrackingState,
	VideoTrackingContext,
} from "./types";
import { METADATA_REFRESH_INTERVAL_MS } from "./types";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function getRegularNextSnapshotAt(
	now: number,
	intervalHours: number,
	minimumIntervalHours: number
): Date {
	return new Date(now + Math.max(intervalHours, minimumIntervalHours) * HOUR);
}

export {
	DEFAULT_INITIAL_SAMPLING_MINUTES,
	DEFAULT_REGULAR_DAILY_TIERS,
	DEFAULT_TRACKING_POLICY,
} from "./policy";

function toEpochMs(value: Date | number | null | undefined): number | undefined {
	if (value === null || value === undefined) return undefined;
	return value instanceof Date ? value.getTime() : value;
}

/**
 * Maps a scheduler outcome onto the persisted `schedule_reason` column.
 *
 * The scheduler reasons are deliberately more granular than the column (they
 * explain *which* branch fired); the column only needs to answer "why is this
 * row due next?", which the admin console groups by.
 */
export function toScheduleReason(
	result: Pick<NextScheduleResult, "nextState" | "consecutiveFails">
): TrackingScheduleReason {
	if (result.consecutiveFails > 0) return "retry";
	switch (result.nextState) {
		case "milestone":
			return "milestone";
		case "archive":
			return "archive_recheck";
		case "new":
			return "initial";
		default:
			return "regular";
	}
}

/**
 * Next full-metadata refresh deadline for a freshly sampled video.
 * New/milestone videos refresh daily, regular ones weekly, archive monthly.
 */
export function computeNextMetadataAt(nextState: TrackingState, now: Date | number): Date {
	const nowMs = now instanceof Date ? now.getTime() : now;
	return new Date(nowMs + METADATA_REFRESH_INTERVAL_MS[nextState]);
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
		!Number.isFinite(currentViews) ||
		!Number.isFinite(previousViews) ||
		!Number.isFinite(currentTimeMs) ||
		!Number.isFinite(previousTimeMs) ||
		currentViews < previousViews ||
		currentTimeMs <= previousTimeMs
	) {
		return 0;
	}

	const hoursDiff = (currentTimeMs - previousTimeMs) / HOUR;
	if (hoursDiff <= 0) return 0;

	const viewDelta = Math.max(0, currentViews - previousViews);
	return viewDelta / hoursDiff;
}

/** Converts a historical view delta into a normalized daily gain. */
export function calculateDailyViewsGain(
	currentViews: number,
	currentTimeMs: number,
	previousViews?: number,
	previousTimeMs?: number | null
): number | null {
	if (
		previousViews === undefined ||
		previousTimeMs === null ||
		previousTimeMs === undefined ||
		!Number.isFinite(currentViews) ||
		!Number.isFinite(previousViews) ||
		!Number.isFinite(currentTimeMs) ||
		!Number.isFinite(previousTimeMs) ||
		currentViews < previousViews ||
		currentTimeMs <= previousTimeMs
	) {
		return null;
	}

	const elapsedMs = currentTimeMs - previousTimeMs;
	const viewDelta = Math.max(0, currentViews - previousViews);
	const dailyViewsGain = (viewDelta * DAY) / elapsedMs;
	return Number.isFinite(dailyViewsGain) ? dailyViewsGain : null;
}

/**
 * Evaluates regular snapshot interval in hours from daily view gain, aligned with cvsa-legacy
 * but with aggressive minimum 1.5h tiers:
 * 0 -> 48h, <6 -> 24h, <24 -> 12h, <96 -> 4h, <192 -> 2h, >=192 -> 1.5h
 */
export function getRegularSnapshotIntervalHours(
	dailyViewsGain: number,
	policy?: TrackingPolicyConfig
): { intervalHours: number; priority: number } {
	const resolvedPolicy = resolveTrackingPolicy(policy);
	const minHours = resolvedPolicy.minRegularIntervalHours;
	const tiers = resolvedPolicy.regularDailyTiers;

	if (dailyViewsGain <= 0) {
		const zeroTier = tiers.find((t) => t.maxDailyViews === 0);
		return {
			intervalHours: Math.max(minHours, zeroTier?.intervalHours ?? 48),
			priority: zeroTier?.priority ?? 3,
		};
	}

	for (const tier of tiers) {
		if (tier.maxDailyViews === 0) continue;
		if (tier.maxDailyViews === null || tier.maxDailyViews === undefined) {
			return {
				intervalHours: Math.max(minHours, tier.intervalHours),
				priority: tier.priority ?? 2,
			};
		}
		if (dailyViewsGain < tier.maxDailyViews) {
			return {
				intervalHours: Math.max(minHours, tier.intervalHours),
				priority: tier.priority ?? (tier.intervalHours <= 4 ? 2 : 3),
			};
		}
	}

	return {
		intervalHours: Math.max(minHours, 1.5),
		priority: 2,
	};
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
	const acceptedAt = toEpochMs(context.acceptedAt);
	const consecutiveFails = context.consecutiveFails ?? 0;
	const policy = resolveTrackingPolicy(context.policy);
	const milestoneMaxEtaHours = policy.milestoneMaxEtaHours;
	const archiveIntervalDays = policy.archiveIntervalDays;

	// Handle error backoff
	if (consecutiveFails > 0) {
		if (context.failureKind === "unavailable") {
			return {
				nextState: "archive",
				nextSnapshotAt: new Date(now + archiveIntervalDays * DAY),
				velocity: 0,
				priority: 4,
				consecutiveFails,
				reason: "video_unavailable_archived",
			};
		}

		// Retry cadence is an error-policy exception to the regular-state interval floor.
		const backoffMs = Math.min(DAY, 5 * MINUTE * 2 ** Math.min(consecutiveFails - 1, 6));
		return {
			nextState: context.currentState,
			nextSnapshotAt: new Date(now + backoffMs),
			velocity: 0,
			priority: 3,
			consecutiveFails,
			reason:
				consecutiveFails >= 10
					? "transient_error_retry_backoff_capped"
					: "error_retry_backoff",
		};
	}

	// Calculate velocity (views per hour)
	let velocity = calculateVelocity(
		context.currentViews,
		now,
		context.previousViews,
		lastCapturedAt
	);

	// Fallback to velocity since publishedAt for newly discovered videos (legacy behavior)
	if (velocity === 0 && context.currentState === "new" && publishedAt && now > publishedAt) {
		const hoursSincePublished = (now - publishedAt) / HOUR;
		if (hoursSincePublished > 0 && context.currentViews > 0) {
			velocity = context.currentViews / hoursSincePublished;
		}
	}

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
			return {
				nextState: "regular",
				nextSnapshotAt: getRegularNextSnapshotAt(now, 1, policy.minRegularIntervalHours),
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
			milestoneInfo.adjustedEtaHours > milestoneMaxEtaHours ||
			milestoneInfo.maxVelocity <= 0
		) {
			return {
				nextState: "regular",
				nextSnapshotAt: getRegularNextSnapshotAt(now, 3, policy.minRegularIntervalHours),
				velocity,
				targetMilestone: null,
				etaHours: milestoneInfo?.etaHours ?? null,
				priority: 2,
				consecutiveFails: 0,
				reason: "milestone_eta_exceeded_144h",
			};
		}

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

	// 2. STATE: NEW (matches cvsa-legacy initial rapid sampling + new-video velocity curve)
	if (context.currentState === "new") {
		const newMaxAgeHours = policy.newMaxAgeHours;
		const newMinVelocity = policy.newMinVelocityAfter2h;
		const initialMinutes = policy.initialSamplingMinutes;

		// Keep the early-sampling cadence anchored to acceptance time, not publication time.
		const acceptedSampleAt = getNextInitialSampleAt(now, acceptedAt, initialMinutes);
		if (acceptedSampleAt !== undefined) {
			return {
				nextState: "new",
				nextSnapshotAt: new Date(acceptedSampleAt),
				velocity,
				priority: 1,
				consecutiveFails: 0,
				reason: "new_video_initial_sample",
			};
		}

		// Existing callers without acceptedAt keep the original first-sample behavior.
		if (acceptedAt === undefined && lastCapturedAt === undefined && initialMinutes.length > 0) {
			const firstMinutes = initialMinutes[0] ?? 1.5;
			return {
				nextState: "new",
				nextSnapshotAt: new Date(now + firstMinutes * MINUTE),
				velocity,
				priority: 1,
				consecutiveFails: 0,
				reason: "new_video_initial_sample",
			};
		}

		if (publishedAt) {
			const timeSincePublished = now - publishedAt;
			if (timeSincePublished > newMaxAgeHours * HOUR) {
				return {
					nextState: "regular",
					nextSnapshotAt: getRegularNextSnapshotAt(
						now,
						1.5,
						policy.minRegularIntervalHours
					),
					velocity,
					priority: 2,
					consecutiveFails: 0,
					reason: "new_period_expired_48h",
				};
			}
			if (timeSincePublished > 2 * HOUR && velocity < newMinVelocity) {
				return {
					nextState: "regular",
					nextSnapshotAt: getRegularNextSnapshotAt(
						now,
						4,
						policy.minRegularIntervalHours
					),
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
		if (velocity > 10) {
			return {
				nextState: "regular",
				nextSnapshotAt: getRegularNextSnapshotAt(now, 1.5, policy.minRegularIntervalHours),
				velocity,
				priority: 2,
				consecutiveFails: 0,
				reason: "archive_revived_due_to_velocity",
			};
		}

		return {
			nextState: "archive",
			nextSnapshotAt: new Date(now + archiveIntervalDays * DAY),
			velocity,
			priority: 4,
			consecutiveFails: 0,
			reason: "archive_periodic_sample",
		};
	}

	// 4. STATE: REGULAR
	if (
		milestoneInfo &&
		milestoneInfo.adjustedEtaHours <= milestoneMaxEtaHours &&
		milestoneInfo.maxVelocity > 0
	) {
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

	const dailyViewsGain = calculateDailyViewsGain(
		context.currentViews,
		now,
		context.previousViews,
		lastCapturedAt
	);

	if (dailyViewsGain === null) {
		return {
			nextState: "regular",
			nextSnapshotAt: getRegularNextSnapshotAt(now, 0, policy.minRegularIntervalHours),
			velocity,
			priority: 2,
			consecutiveFails: 0,
			reason: "regular_baseline_sample",
		};
	}

	if (dailyViewsGain <= 0) {
		const isOld = publishedAt ? now - publishedAt > 30 * DAY : false;
		if (isOld) {
			return {
				nextState: "archive",
				nextSnapshotAt: new Date(now + archiveIntervalDays * DAY),
				velocity,
				priority: 4,
				consecutiveFails: 0,
				reason: "regular_demoted_to_archive",
			};
		}
	}

	const { intervalHours, priority } = getRegularSnapshotIntervalHours(dailyViewsGain, policy);

	return {
		nextState: "regular",
		nextSnapshotAt: getRegularNextSnapshotAt(
			now,
			intervalHours,
			policy.minRegularIntervalHours
		),
		velocity,
		priority,
		consecutiveFails: 0,
		reason: "regular_tracking",
	};
}
