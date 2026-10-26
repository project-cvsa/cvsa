import { describe, expect, it } from "bun:test";
import {
	RetryPolicySchema,
	TrackingFailureKindSchema,
	TrackingPolicySchema,
} from "../../src/crawler/policies";

describe("tracking policy contracts", () => {
	it("accepts the current bootstrap offsets and configurable regular tiers", () => {
		const result = TrackingPolicySchema.safeParse({
			initialSamplingMinutes: [1.5, 3, 5, 10],
			regularDailyTiers: [
				{ maxDailyViews: 0, intervalHours: 48 },
				{ maxDailyViews: 6, intervalHours: 24 },
				{ maxDailyViews: 24, intervalHours: 12 },
				{ maxDailyViews: 96, intervalHours: 4 },
				{ maxDailyViews: 192, intervalHours: 2 },
				{ maxDailyViews: null, intervalHours: 1.5 },
			],
		});

		expect(result.success).toBe(true);
	});

	it("allows adjusted thresholds and bootstrap intervals but rejects invalid order and cadence", () => {
		expect(
			TrackingPolicySchema.safeParse({
				initialSamplingMinutes: [2, 6],
				regularDailyTiers: [
					{ maxDailyViews: 2, intervalHours: 36 },
					{ maxDailyViews: 18, intervalHours: 1.5 },
				],
			}).success
		).toBe(true);
		expect(TrackingPolicySchema.safeParse({ initialSamplingMinutes: [3, 1.5] }).success).toBe(
			false
		);
		expect(
			TrackingPolicySchema.safeParse({
				regularDailyTiers: [{ maxDailyViews: 1, intervalHours: 1.49 }],
			}).success
		).toBe(false);
	});

	it("validates bounded retry attempts and ordered delay limits", () => {
		expect(
			RetryPolicySchema.safeParse({ maxAttempts: 5, baseDelayMs: 250, maxDelayMs: 5_000 })
				.success
		).toBe(true);
		expect(
			RetryPolicySchema.safeParse({ maxAttempts: 21, baseDelayMs: 250, maxDelayMs: 5_000 })
				.success
		).toBe(false);
		expect(
			RetryPolicySchema.safeParse({ maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 250 })
				.success
		).toBe(false);
	});

	it("limits tracking failure kinds to transient and unavailable", () => {
		expect(TrackingFailureKindSchema.safeParse("transient").success).toBe(true);
		expect(TrackingFailureKindSchema.safeParse("unavailable").success).toBe(true);
		expect(TrackingFailureKindSchema.safeParse("timeout").success).toBe(false);
	});
});
