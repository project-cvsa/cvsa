import { z } from "zod";

export const CrawlerTaskStatusSchema = z.enum([
	"waiting",
	"running",
	"succeeded",
	"partial",
	"deferred",
	"failed",
	"cancelled",
]);

export const CrawlerTaskTypeSchema = z.enum([
	"searchSweep",
	"hotDiscovery",
	"metadataRefresh",
	"trackingDispatch",
]);

export const CrawlerTaskSummarySchema = z.object({
	taskId: z.string().min(1),
	taskType: CrawlerTaskTypeSchema,
	status: CrawlerTaskStatusSchema,
	createdAt: z.iso.datetime(),
	startedAt: z.iso.datetime().nullable(),
	completedAt: z.iso.datetime().nullable(),
});

export const CrawlerTaskListQuerySchema = z.object({
	status: CrawlerTaskStatusSchema.optional(),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const CrawlerTaskPageSchema = z.object({
	items: z.array(CrawlerTaskSummarySchema),
	total: z.number().int().nonnegative(),
	page: z.number().int().min(1),
	pageSize: z.number().int().min(1).max(100),
});

/** A schedule for one of the crawler's named periodic tasks. */
export const CrawlerTaskPlanSchema = z.object({
	enabled: z.boolean(),
	intervalMs: z.number().int().positive(),
});

export const CrawlerTaskPlansSchema = z.object({
	searchSweep: CrawlerTaskPlanSchema,
	hotDiscovery: CrawlerTaskPlanSchema,
	metadataRefresh: CrawlerTaskPlanSchema,
	trackingDispatch: CrawlerTaskPlanSchema,
});

export const CrawlerWorkerCapacitySchema = z.object({
	concurrency: z.number().int().positive(),
	capacity: z.number().int().positive(),
});

export const CrawlerWorkerCapacitiesSchema = z.object({
	tracking: CrawlerWorkerCapacitySchema,
	discovery: CrawlerWorkerCapacitySchema,
	model: CrawlerWorkerCapacitySchema,
});

export const CrawlerOperationsConfigSchema = z.object({
	taskPlans: CrawlerTaskPlansSchema,
	workerCapacities: CrawlerWorkerCapacitiesSchema,
});

export const CrawlerOperationsConfigDocumentSchema = z.object({
	revision: z.number().int().positive(),
	config: CrawlerOperationsConfigSchema,
	updatedAt: z.iso.datetime(),
});

export const ReplaceCrawlerOperationsConfigRequestSchema = z.object({
	revision: z.number().int().nonnegative(),
	config: CrawlerOperationsConfigSchema,
});

export const CrawlerTaskStatsSchema = z
	.object({
		windowSeconds: z.number().int().positive(),
		completedRequests: z.number().int().nonnegative(),
		requestsPerSecond: z.number().nonnegative(),
		requestSuccessRate: z.number().min(0).max(1).nullable(),
		snapshotSamplesPerSecond: z.number().nonnegative(),
		detailFetchesPerSecond: z.number().nonnegative(),
		classificationsPerSecond: z.number().nonnegative(),
		oldestDueAgeSeconds: z.number().nonnegative(),
	})
	.superRefine((stats, context) => {
		if (stats.completedRequests === 0 && stats.requestSuccessRate !== null) {
			context.addIssue({
				code: "custom",
				message: "requestSuccessRate must be null when there are no completed requests",
				path: ["requestSuccessRate"],
			});
		}

		if (stats.completedRequests > 0 && stats.requestSuccessRate === null) {
			context.addIssue({
				code: "custom",
				message: "requestSuccessRate must be a value when requests have completed",
				path: ["requestSuccessRate"],
			});
		}
	});

export type CrawlerTaskStatus = z.infer<typeof CrawlerTaskStatusSchema>;
export type CrawlerTaskType = z.infer<typeof CrawlerTaskTypeSchema>;
export type CrawlerTaskSummary = z.infer<typeof CrawlerTaskSummarySchema>;
export type CrawlerTaskListQuery = z.infer<typeof CrawlerTaskListQuerySchema>;
export type CrawlerTaskPage = z.infer<typeof CrawlerTaskPageSchema>;
export type CrawlerTaskPlan = z.infer<typeof CrawlerTaskPlanSchema>;
export type CrawlerTaskPlans = z.infer<typeof CrawlerTaskPlansSchema>;
export type CrawlerWorkerCapacity = z.infer<typeof CrawlerWorkerCapacitySchema>;
export type CrawlerWorkerCapacities = z.infer<typeof CrawlerWorkerCapacitiesSchema>;
export type CrawlerOperationsConfig = z.infer<typeof CrawlerOperationsConfigSchema>;
export type CrawlerOperationsConfigDocument = z.infer<typeof CrawlerOperationsConfigDocumentSchema>;
export type ReplaceCrawlerOperationsConfigRequest = z.infer<
	typeof ReplaceCrawlerOperationsConfigRequestSchema
>;
export type CrawlerTaskStats = z.infer<typeof CrawlerTaskStatsSchema>;
