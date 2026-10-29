import { Elysia } from "elysia";
import {
	CrawlerOverviewStatsSchema,
	CrawlerQueueJobDetailSchema,
	CrawlerQueueJobParamsSchema,
	CrawlerQueueJobsQuerySchema,
	CrawlerQueueJobsResponseSchema,
	CrawlerStatsQuerySchema,
	CrawlerJobActionResponseSchema,
	ErrorResponseSchema,
} from "@cvsa/contracts";
import { crawlerAdminStatsService } from "../container";

const jobErrors = {
	401: ErrorResponseSchema,
	404: ErrorResponseSchema,
	409: ErrorResponseSchema,
	422: ErrorResponseSchema,
};
export const statsRoutes = new Elysia()
	.get("/overview", ({ query }) => crawlerAdminStatsService.overview(query), {
		query: CrawlerStatsQuerySchema,
		response: {
			200: CrawlerOverviewStatsSchema,
			401: ErrorResponseSchema,
			422: ErrorResponseSchema,
		},
	})
	.get("/jobs", ({ query }) => crawlerAdminStatsService.jobs(query), {
		query: CrawlerQueueJobsQuerySchema,
		response: {
			200: CrawlerQueueJobsResponseSchema,
			401: ErrorResponseSchema,
			422: ErrorResponseSchema,
		},
	})
	.get(
		"/jobs/:queue/:id",
		({ params }) => crawlerAdminStatsService.detail(params.queue, params.id),
		{
			params: CrawlerQueueJobParamsSchema,
			response: { 200: CrawlerQueueJobDetailSchema, ...jobErrors },
		}
	)
	.post(
		"/jobs/:queue/:id/retries",
		({ params }) => crawlerAdminStatsService.retry(params.queue, params.id),
		{
			params: CrawlerQueueJobParamsSchema,
			response: { 200: CrawlerJobActionResponseSchema, ...jobErrors },
		}
	)
	.delete(
		"/jobs/:queue/:id",
		({ params }) => crawlerAdminStatsService.remove(params.queue, params.id),
		{
			params: CrawlerQueueJobParamsSchema,
			response: { 200: CrawlerJobActionResponseSchema, ...jobErrors },
		}
	);
