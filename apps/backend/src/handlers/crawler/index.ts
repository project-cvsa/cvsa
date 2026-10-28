import { Elysia } from "elysia";
import {
	ActionQueuedResponseSchema,
	BilibiliVideoMetadataDtoSchema,
	BilibiliVideoRelationDtoSchema,
	ClassifierHealthDtoSchema,
	CrawlerOverviewStatsSchema,
	CrawlerStatsQuerySchema,
	CrawlerStatusDtoSchema,
	DiscoveryFilterConfigDtoSchema,
	DiscoverySampleItemSchema,
	DiscoverySampleListQuerySchema,
	DiscoverySampleListResponseSchema,
	DiscoverySweepRequestSchema,
	DiscoverySweepResponseSchema,
	IngestVideoRequestSchema,
	IngestVideoResponseSchema,
	LabelDiscoverySampleRequestSchema,
	NetworkRuntimeConfigDocumentSchema,
	ProcessRecommendationsResponseSchema,
	PromoteTrackingVideoRequestSchema,
	RecommendationGraphResponseSchema,
	RegisterTrackingVideosRequestSchema,
	RegisterTrackingVideosResponseSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
	TestNetworkAdapterResponseSchema,
	TrackingVideoListQuerySchema,
	TrackingVideoListResponseSchema,
	UpdateDiscoveryFilterConfigRequestSchema,
	VideoMetadataHistoryListQuerySchema,
	VideoMetadataHistoryListResponseSchema,
	VideoTrackingDtoSchema,
	type ActionQueuedResponse,
	type BilibiliVideoMetadataDto,
	type ClassifierHealthDto,
	type BilibiliVideoRelationDto,
	type CrawlerOverviewStats,
	type CrawlerStatusDto,
	type DiscoveryFilterConfigDto,
	type DiscoverySampleItem,
	type DiscoverySampleListResponse,
	type DiscoverySweepResponse,
	type IngestVideoResponse,
	type NetworkRuntimeConfigDocument,
	type ProcessRecommendationsResponse,
	type RecommendationGraphResponse,
	type RegisterTrackingVideosResponse,
	type TestNetworkAdapterResponse,
	type TrackingVideoListResponse,
	type VideoMetadataHistoryListResponse,
	type VideoTrackingDto,
} from "@cvsa/contracts";
import { adminAuthMiddleware } from "@/middlewares";
import { callCrawlerApi } from "./client";

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
		"/stats",
		async ({ query }): Promise<CrawlerOverviewStats> => {
			return callCrawlerApi<CrawlerOverviewStats>("/stats/overview", "GET", undefined, query);
		},
		{
			query: CrawlerStatsQuerySchema,
			response: {
				200: CrawlerOverviewStatsSchema,
			},
		}
	)
	.get(
		"/classifier",
		async (): Promise<ClassifierHealthDto> => {
			return callCrawlerApi<ClassifierHealthDto>("/discovery/classifier");
		},
		{
			response: {
				200: ClassifierHealthDtoSchema,
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
	.get(
		"/config/network",
		async (): Promise<NetworkRuntimeConfigDocument> => {
			return callCrawlerApi<NetworkRuntimeConfigDocument>("/network-runtime/config");
		},
		{
			response: {
				200: NetworkRuntimeConfigDocumentSchema,
			},
		}
	)
	.put(
		"/config/network",
		async ({ body }): Promise<NetworkRuntimeConfigDocument> => {
			return callCrawlerApi<NetworkRuntimeConfigDocument>(
				"/network-runtime/config",
				"PUT",
				body
			);
		},
		{
			body: ReplaceNetworkRuntimeConfigRequestSchema,
			response: {
				200: NetworkRuntimeConfigDocumentSchema,
			},
		}
	)
	.post(
		"/network/adapters/:id/test",
		async ({ params }): Promise<TestNetworkAdapterResponse> => {
			return callCrawlerApi<TestNetworkAdapterResponse>(
				`/network-runtime/adapters/${params.id}/test`,
				"POST"
			);
		},
		{
			response: {
				200: TestNetworkAdapterResponseSchema,
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
		"/hot-sample",
		async (): Promise<DiscoverySweepResponse> => {
			return callCrawlerApi<DiscoverySweepResponse>("/discovery/hot-sample", "POST");
		},
		{
			response: {
				200: DiscoverySweepResponseSchema,
			},
		}
	)
	.post(
		"/detail/:aid",
		async ({ params }): Promise<ActionQueuedResponse> => {
			return callCrawlerApi<ActionQueuedResponse>(`/discovery/detail/${params.aid}`, "POST");
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
			},
		}
	)
	.post(
		"/active/:aid",
		async ({ params }): Promise<ActionQueuedResponse> => {
			return callCrawlerApi<ActionQueuedResponse>(`/discovery/active/${params.aid}`, "POST");
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
			},
		}
	)
	.post(
		"/recommendations/:aid",
		async ({ params }): Promise<ProcessRecommendationsResponse> => {
			return callCrawlerApi<ProcessRecommendationsResponse>(
				`/discovery/recommendations/${params.aid}`,
				"POST"
			);
		},
		{
			response: {
				200: ProcessRecommendationsResponseSchema,
			},
		}
	)
	.get(
		"/tracking/videos",
		async ({ query }): Promise<TrackingVideoListResponse> => {
			return callCrawlerApi<TrackingVideoListResponse>(
				"/tracking/videos",
				"GET",
				undefined,
				query
			);
		},
		{
			query: TrackingVideoListQuerySchema,
			response: {
				200: TrackingVideoListResponseSchema,
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
		"/tracking/ingest",
		async ({ body }): Promise<IngestVideoResponse> => {
			return callCrawlerApi<IngestVideoResponse>("/tracking/ingest", "POST", body);
		},
		{
			body: IngestVideoRequestSchema,
			response: {
				200: IngestVideoResponseSchema,
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
				200: BilibiliVideoRelationDtoSchema.array(),
			},
		}
	)
	.get(
		"/graph/:identifier",
		async ({ params }): Promise<RecommendationGraphResponse> => {
			return callCrawlerApi<RecommendationGraphResponse>(
				`/discovery/graph/${params.identifier}`
			);
		},
		{
			response: {
				200: RecommendationGraphResponseSchema,
			},
		}
	)
	.get(
		"/metadata/:aid/history",
		async ({ params, query }): Promise<VideoMetadataHistoryListResponse> => {
			return callCrawlerApi<VideoMetadataHistoryListResponse>(
				`/discovery/metadata/${params.aid}/history`,
				"GET",
				undefined,
				query
			);
		},
		{
			query: VideoMetadataHistoryListQuerySchema,
			response: {
				200: VideoMetadataHistoryListResponseSchema,
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
	)
	.get(
		"/discovery/samples",
		async ({ query }): Promise<DiscoverySampleListResponse> => {
			return callCrawlerApi<DiscoverySampleListResponse>(
				"/discovery/samples",
				"GET",
				undefined,
				query
			);
		},
		{
			query: DiscoverySampleListQuerySchema,
			response: {
				200: DiscoverySampleListResponseSchema,
			},
		}
	)
	.post(
		"/discovery/samples/:aid/label",
		async ({ params, body }): Promise<DiscoverySampleItem> => {
			return callCrawlerApi<DiscoverySampleItem>(
				`/discovery/samples/${params.aid}/label`,
				"POST",
				body
			);
		},
		{
			body: LabelDiscoverySampleRequestSchema,
			response: {
				200: DiscoverySampleItemSchema,
			},
		}
	);
