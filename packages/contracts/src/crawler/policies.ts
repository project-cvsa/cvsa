import { z } from "zod";

/**
 * Runtime validation for the tracking policy shape owned by the crawler.
 * Defaults live in `apps/crawler/src/crawler/tracking/policy.ts`; this schema
 * intentionally validates caller-supplied values without maintaining another
 * copy of those defaults or a second TypeScript policy type.
 */
export const RegularTrackingTierSchema = z.object({
	maxDailyViews: z.number().int().nonnegative().nullable().optional(),
	intervalHours: z.number().min(1.5),
	priority: z.number().int().positive().optional(),
});

export const TrackingPolicySchema = z.object({
	initialSamplingMinutes: z
		.array(z.number().positive())
		.min(1)
		.superRefine((minutes, context) => {
			for (let index = 1; index < minutes.length; index += 1) {
				const previous = minutes[index - 1];
				const current = minutes[index];
				if (previous !== undefined && current !== undefined && current <= previous) {
					context.addIssue({
						code: "custom",
						message: "Initial sampling minutes must be strictly increasing",
						path: [index],
					});
				}
			}
		})
		.optional(),
	newMaxAgeHours: z.number().positive().optional(),
	newMinVelocityAfter2h: z.number().nonnegative().optional(),
	regularDailyTiers: z
		.array(RegularTrackingTierSchema)
		.min(1)
		.superRefine((tiers, context) => {
			let previousThreshold: number | undefined;
			let sawCatchAll = false;

			for (let index = 0; index < tiers.length; index += 1) {
				const threshold = tiers[index]?.maxDailyViews;
				if (threshold === null || threshold === undefined) {
					if (sawCatchAll || index !== tiers.length - 1) {
						context.addIssue({
							code: "custom",
							message: "The catch-all tier must appear once at the end",
							path: [index, "maxDailyViews"],
						});
					}
					sawCatchAll = true;
					continue;
				}

				if (previousThreshold !== undefined && threshold <= previousThreshold) {
					context.addIssue({
						code: "custom",
						message: "Daily view thresholds must be strictly increasing",
						path: [index, "maxDailyViews"],
					});
				}
				previousThreshold = threshold;
			}
		})
		.optional(),
	minRegularIntervalHours: z.number().min(1.5).optional(),
	milestoneMaxEtaHours: z.number().positive().optional(),
	archiveIntervalDays: z.number().positive().optional(),
	queueCap: z.number().int().positive().optional(),
});

export const RetryPolicySchema = z
	.object({
		maxAttempts: z.number().int().min(1).max(20),
		baseDelayMs: z.number().int().min(100),
		maxDelayMs: z.number().int().min(100),
	})
	.refine((policy) => policy.maxDelayMs >= policy.baseDelayMs, {
		message: "maxDelayMs must be greater than or equal to baseDelayMs",
		path: ["maxDelayMs"],
	});

export const TrackingFailureKindSchema = z.enum(["transient", "unavailable"]);

export type RegularSpeedTier = z.infer<typeof RegularTrackingTierSchema>;
export type TrackingPolicyConfig = z.infer<typeof TrackingPolicySchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type TrackingFailureKind = z.infer<typeof TrackingFailureKindSchema>;
