import { Elysia } from "elysia";
import {
	MilestoneAidParamsSchema,
	MilestoneListResponseSchema,
	MilestoneImportRequestSchema,
	MilestoneImportResponseSchema,
	MilestoneRecoveryRequestSchema,
	MilestoneQueuedResponseSchema,
	MilestoneBacktestRequestSchema,
	MilestoneBacktestResultSchema,
	CacheWindowAnalysisRequestSchema,
	CacheWindowAnalysisResultSchema,
	MilestoneRecoveryParamsSchema,
	MilestoneRecoveryStatusSchema,
} from "@cvsa/contracts";
import { milestoneService, milestoneMaintenance } from "../container";

export const milestoneRoutes = new Elysia({ name: "milestoneRoutes" })
	.get("/videos/:aid", ({ params }) => milestoneService.list(params.aid), {
		params: MilestoneAidParamsSchema,
		response: { 200: MilestoneListResponseSchema },
	})
	.post("/records", ({ body }) => milestoneService.import(body), {
		body: MilestoneImportRequestSchema,
		response: { 200: MilestoneImportResponseSchema },
	})
	.post("/recoveries", ({ body }) => milestoneMaintenance.enqueue(body), {
		body: MilestoneRecoveryRequestSchema,
		response: { 200: MilestoneQueuedResponseSchema },
	})
	.get("/recoveries/:id", ({ params }) => milestoneMaintenance.status(params.id), {
		params: MilestoneRecoveryParamsSchema,
		response: { 200: MilestoneRecoveryStatusSchema },
	})
	.post("/backtests", ({ body }) => milestoneService.backtest(body), {
		body: MilestoneBacktestRequestSchema,
		response: { 200: MilestoneBacktestResultSchema },
	})
	.post("/cache-window-analyses", ({ body }) => milestoneService.analyzeWindows(body), {
		body: CacheWindowAnalysisRequestSchema,
		response: { 200: CacheWindowAnalysisResultSchema },
	});
