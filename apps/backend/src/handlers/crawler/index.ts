import { Elysia } from "elysia";
import { z } from "zod";
import {
	BilibiliVideoMetadataDtoSchema,
	BilibiliVideoRelationDtoSchema,
	CrawlerStatusDtoSchema,
	DiscoveryFilterConfigDtoSchema,
	DiscoverySweepRequestSchema,
	DiscoverySweepResponseSchema,
	PromoteTrackingVideoRequestSchema,
	RegisterTrackingVideosRequestSchema,
	RegisterTrackingVideosResponseSchema,
	UpdateDiscoveryFilterConfigRequestSchema,
	VideoTrackingDtoSchema,
	type BilibiliVideoMetadataDto,
	type BilibiliVideoRelationDto,
	type CrawlerStatusDto,
	type DiscoveryFilterConfigDto,
	type DiscoverySweepResponse,
	type RegisterTrackingVideosResponse,
	type VideoTrackingDto,
} from "@cvsa/contracts";
import { adminAuthMiddleware } from "@/middlewares";
import { callCrawlerApi } from "./client";

const ActionQueuedResponseSchema = z.object({
	queued: z.boolean(),
	aid: z.string(),
});

export const crawlerAdminHandler = new Elysia({ prefix: "/admin/crawler" })
	.use(adminAuthMiddleware)
	.get(
		"/status",
		async (): Promise<CrawlerStatusDto> => {
			return callCrawlerApi<CrawlerStatusDto>("/network-runtime/status");
		},
		{
			response: {
				200: CrawlerStatusDtoSchema,
			},
		}
	)
	.get(
		"/config/discovery",
		async (): Promise<DiscoveryFilterConfigDto> => {
			return callCrawlerApi<DiscoveryFilterConfigDto>("/discovery/config");
		},
		{
			response: {
				200: DiscoveryFilterConfigDtoSchema,
			},
		}
	)
	.put(
		"/config/discovery",
		async ({ body }): Promise<DiscoveryFilterConfigDto> => {
			return callCrawlerApi<DiscoveryFilterConfigDto>("/discovery/config", "PUT", body);
		},
		{
			body: UpdateDiscoveryFilterConfigRequestSchema,
			response: {
				200: DiscoveryFilterConfigDtoSchema,
			},
		}
	)
	.post(
		"/sweep",
		async ({ body }): Promise<DiscoverySweepResponse> => {
			return callCrawlerApi<DiscoverySweepResponse>("/discovery/sweep", "POST", body);
		},
		{
			body: DiscoverySweepRequestSchema,
			response: {
				200: DiscoverySweepResponseSchema,
			},
		}
	)
	.post(
		"/detail/:aid",
		async ({ params }): Promise<z.infer<typeof ActionQueuedResponseSchema>> => {
			return callCrawlerApi<z.infer<typeof ActionQueuedResponseSchema>>(
				`/discovery/detail/${params.aid}`,
				"POST"
			);
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
			},
		}
	)
	.post(
		"/active/:aid",
		async ({ params }): Promise<z.infer<typeof ActionQueuedResponseSchema>> => {
			return callCrawlerApi<z.infer<typeof ActionQueuedResponseSchema>>(
				`/discovery/active/${params.aid}`,
				"POST"
			);
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
			},
		}
	)
	.get(
		"/tracking/:aid",
		async ({ params }): Promise<VideoTrackingDto> => {
			return callCrawlerApi<VideoTrackingDto>(`/tracking/videos/${params.aid}`);
		},
		{
			response: {
				200: VideoTrackingDtoSchema,
			},
		}
	)
	.post(
		"/tracking/videos",
		async ({ body }): Promise<RegisterTrackingVideosResponse> => {
			return callCrawlerApi<RegisterTrackingVideosResponse>("/tracking/videos", "POST", body);
		},
		{
			body: RegisterTrackingVideosRequestSchema,
			response: {
				200: RegisterTrackingVideosResponseSchema,
			},
		}
	)
	.post(
		"/tracking/videos/:aid/promote",
		async ({ params, body }): Promise<VideoTrackingDto> => {
			return callCrawlerApi<VideoTrackingDto>(
				`/tracking/videos/${params.aid}/promote`,
				"POST",
				body
			);
		},
		{
			body: PromoteTrackingVideoRequestSchema,
			response: {
				200: VideoTrackingDtoSchema,
			},
		}
	)
	.get(
		"/relations/:aid",
		async ({ params }): Promise<BilibiliVideoRelationDto[]> => {
			return callCrawlerApi<BilibiliVideoRelationDto[]>(`/discovery/relations/${params.aid}`);
		},
		{
			response: {
				200: z.array(BilibiliVideoRelationDtoSchema),
			},
		}
	)
	.get(
		"/metadata/:aid",
		async ({ params }): Promise<BilibiliVideoMetadataDto> => {
			return callCrawlerApi<BilibiliVideoMetadataDto>(`/discovery/metadata/${params.aid}`);
		},
		{
			response: {
				200: BilibiliVideoMetadataDtoSchema,
			},
		}
	);
