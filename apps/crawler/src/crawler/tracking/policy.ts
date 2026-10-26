import type { RegularSpeedTier, TrackingPolicyConfig } from "./types";

export const DEFAULT_REGULAR_DAILY_TIERS: RegularSpeedTier[] = [
	{ maxDailyViews: 0, intervalHours: 48, priority: 3 },
	{ maxDailyViews: 6, intervalHours: 24, priority: 3 },
	{ maxDailyViews: 24, intervalHours: 12, priority: 3 },
	{ maxDailyViews: 96, intervalHours: 4, priority: 2 },
	{ maxDailyViews: 192, intervalHours: 2, priority: 2 },
	{ maxDailyViews: null, intervalHours: 1.5, priority: 2 },
];

export const DEFAULT_INITIAL_SAMPLING_MINUTES = [1.5, 3, 5, 10];

export const DEFAULT_TRACKING_POLICY: Required<TrackingPolicyConfig> = {
	initialSamplingMinutes: DEFAULT_INITIAL_SAMPLING_MINUTES,
	newMaxAgeHours: 48,
	newMinVelocityAfter2h: 10,
	regularDailyTiers: DEFAULT_REGULAR_DAILY_TIERS,
	minRegularIntervalHours: 1.5,
	milestoneMaxEtaHours: 144,
	archiveIntervalDays: 7,
	queueCap: 200,
};

export function resolveTrackingPolicy(
	policy?: TrackingPolicyConfig
): Required<TrackingPolicyConfig> {
	return {
		...DEFAULT_TRACKING_POLICY,
		...policy,
		initialSamplingMinutes:
			policy?.initialSamplingMinutes ?? DEFAULT_TRACKING_POLICY.initialSamplingMinutes,
		regularDailyTiers: policy?.regularDailyTiers ?? DEFAULT_REGULAR_DAILY_TIERS,
	};
}

export function getNextInitialSampleAt(
	currentTimeMs: number,
	acceptedAtMs: number | undefined,
	intervalsMinutes: number[]
): number | undefined {
	if (acceptedAtMs === undefined) return undefined;

	const intervals = intervalsMinutes
		.filter((minutes) => Number.isFinite(minutes) && minutes > 0)
		.sort((a, b) => a - b);

	for (const minutes of intervals) {
		const sampleAt = acceptedAtMs + minutes * 60 * 1_000;
		if (sampleAt > currentTimeMs) return sampleAt;
	}

	return undefined;
}
