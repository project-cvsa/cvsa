import type { TrackingPolicyConfig } from "./types";
import { DEFAULT_TRACKING_POLICY, DEFAULT_REGULAR_DAILY_TIERS } from "@cvsa/contracts";
export {
	DEFAULT_INITIAL_SAMPLING_MINUTES,
	DEFAULT_REGULAR_DAILY_TIERS,
	DEFAULT_TRACKING_POLICY,
} from "@cvsa/contracts";

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

export function trackingRetryMs(state: string, policy: TrackingPolicyConfig = {}): number {
	const resolved = resolveTrackingPolicy(policy);
	if (state === "milestone") return resolved.milestoneRetryMs;
	if (state === "new") return resolved.newRetryMs;
	if (state === "archive") return resolved.archiveRetryMs;
	return resolved.regularRetryMs;
}

export function trackingMaxLatenessMs(state: string, policy: TrackingPolicyConfig = {}): number {
	const resolved = resolveTrackingPolicy(policy);
	if (state === "milestone") return resolved.milestoneMaxLatenessMs;
	if (state === "new") return resolved.newMaxLatenessMs;
	if (state === "archive") return resolved.archiveMaxLatenessMs;
	return resolved.regularMaxLatenessMs;
}

export function milestoneDelayMs(adjustedEtaMs: number, policy: TrackingPolicyConfig = {}): number {
	const resolved = resolveTrackingPolicy(policy);
	return Math.max(
		2000,
		Math.min(
			adjustedEtaMs <= resolved.milestoneCaptureLeadMs
				? resolved.milestoneCaptureIntervalMs
				: 3600000,
			Math.round(adjustedEtaMs)
		)
	);
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
