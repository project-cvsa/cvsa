import { z } from "zod";
import { TrackingPolicySchema } from "./policies";

export const MilestoneAidParamsSchema = z.object({ aid: z.string().regex(/^\d+$/) });
export const MilestoneImportItemSchema = z
	.object({
		aid: z.string().regex(/^\d+$/),
		threshold: z.number().int().positive().max(2147483647),
		at: z.iso.datetime({ offset: true }),
		timeKind: z.enum(["exact", "minute", "by"]),
		views: z.number().int().nonnegative().max(2147483647).nullable().optional(),
		note: z.string().max(4000).optional(),
	})
	.refine((item) => item.views == null || item.views >= item.threshold, {
		message: "Observed views must reach the threshold",
		path: ["views"],
	});
export const MilestoneImportRequestSchema = z.object({
	items: z.array(MilestoneImportItemSchema).min(1).max(1000),
});
export const MilestoneImportResponseSchema = z.object({ inserted: z.number().int().nonnegative() });
export const MilestoneRecordSchema = z.object({
	aid: z.string(),
	threshold: z.number().int(),
	source: z.enum(["live", "history", "manual"]),
	timeKind: z.enum(["observed", "by", "exact", "minute"]),
	at: z.string(),
	views: z.number().nullable(),
	previousAt: z.string().nullable(),
	previousViews: z.number().nullable(),
	scheduledAt: z.string().nullable(),
	requestStartedAt: z.string().nullable(),
	note: z.string().nullable(),
	recordedAt: z.string(),
});
export const MilestoneAchievementSchema = z.object({
	threshold: z.number(),
	reachedMinute: z.string().nullable(),
	firstObservedAt: z.string().nullable(),
	knownBy: z.string(),
});
export const MilestoneListResponseSchema = z.object({
	items: z.array(MilestoneRecordSchema),
	achievements: z.array(MilestoneAchievementSchema),
});
export const MilestoneRecoveryRequestSchema = z.object({
	afterAid: z.string().regex(/^\d+$/).default("0"),
	minimumViews: z.number().int().positive().default(100000),
	batchSize: z.number().int().min(1).max(10000).default(1000),
});
export const MilestoneRecoveryJobSchema = MilestoneRecoveryRequestSchema.extend({
	recoveryId: z.uuid(),
	prepared: z.boolean().default(false),
	_timeoutMs: z.number().int().positive().default(1800000),
	processed: z.number().int().nonnegative().default(0),
	inserted: z.number().int().nonnegative().default(0),
	through: z.iso.datetime({ offset: true }),
	currentAid: z.string().optional(),
	afterTime: z.iso.datetime({ offset: true }).optional(),
	previous: z.object({ at: z.string(), views: z.number().int() }).optional(),
});
export const MilestoneQueuedResponseSchema = z.object({
	queued: z.literal(true),
	jobId: z.string(),
});
export const MilestoneRecoveryParamsSchema = z.object({ id: z.string().min(1) });
export const MilestoneRecoveryStatusSchema = z.object({
	id: z.string(),
	state: z.string(),
	data: MilestoneRecoveryJobSchema,
	failedReason: z.string().nullable(),
});
export const MilestoneBacktestRequestSchema = z
	.object({
		aid: z.string().regex(/^\d+$/),
		threshold: z.number().int().positive(),
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
		initialState: z.enum(["new", "regular", "milestone", "archive"]).default("regular"),
		executionDelayMs: z.number().int().nonnegative().default(0),
		policy: TrackingPolicySchema.default({}),
		publishedAt: z.iso.datetime({ offset: true }).optional(),
		acceptedAt: z.iso.datetime({ offset: true }).optional(),
	})
	.refine((value) => Date.parse(value.to) > Date.parse(value.from), {
		message: "to must follow from",
		path: ["to"],
	});
export const MilestoneBacktestResultSchema = z.object({
	aid: z.string(),
	threshold: z.number(),
	requests: z.number(),
	traceSamples: z.number(),
	firstRecordedAt: z.string().nullable(),
	detectedAt: z.string().nullable(),
	enteredMilestoneAt: z.string().nullable(),
	referenceMinute: z.string().nullable(),
	minuteResult: z.enum(["captured", "missed", "unknown"]),
	delayFromFirstRecordedMs: z.number().nullable(),
	maxTraceGapMs: z.number(),
	computeMs: z.number(),
});
export const CacheWindowAnalysisRequestSchema = z
	.object({
		aids: z.array(z.string().regex(/^\d+$/)).min(1).max(20),
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
		minimumPeriodMs: z.number().int().min(1000).default(50000),
		maximumPeriodMs: z.number().int().max(300000).default(100000),
		stepMs: z.number().int().min(100).default(1000),
	})
	.refine(
		(value) =>
			value.maximumPeriodMs >= value.minimumPeriodMs &&
			Date.parse(value.to) > Date.parse(value.from),
		{ message: "Invalid period or time range" }
	);
export const CacheWindowAnalysisResultSchema = z.object({
	videos: z.array(
		z.object({
			aid: z.string(),
			samples: z.number(),
			changes: z.number(),
			maxSampleGapMs: z.number(),
			bestPeriodMs: z.number().nullable(),
			phaseMs: z.number().nullable(),
			phaseErrorMs: z.number().nullable(),
		})
	),
	sharedPeriodMs: z.number().nullable(),
	sharedPhaseErrorMs: z.number().nullable(),
});

export type MilestoneImportRequest = z.infer<typeof MilestoneImportRequestSchema>;
export type MilestoneRecoveryJob = z.infer<typeof MilestoneRecoveryJobSchema>;
export type MilestoneRecord = z.infer<typeof MilestoneRecordSchema>;
export type MilestoneAchievement = z.infer<typeof MilestoneAchievementSchema>;
export type MilestoneBacktestRequest = z.infer<typeof MilestoneBacktestRequestSchema>;
export type MilestoneBacktestResult = z.infer<typeof MilestoneBacktestResultSchema>;
export type CacheWindowAnalysisRequest = z.infer<typeof CacheWindowAnalysisRequestSchema>;
export type CacheWindowAnalysisResult = z.infer<typeof CacheWindowAnalysisResultSchema>;
export type MilestoneRecoveryStatus = z.infer<typeof MilestoneRecoveryStatusSchema>;
export type MilestoneRecoveryRequest = z.infer<typeof MilestoneRecoveryRequestSchema>;
