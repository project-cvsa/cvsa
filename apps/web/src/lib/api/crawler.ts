/**
 * Crawler Control Plane endpoints (`/admin/crawler/*`).
 */
import type {
	ActionQueuedResponse,
	BilibiliVideoMetadataDto,
	BilibiliVideoRelationDto,
	ClassifierHealthDto,
	CrawlerOverviewStats,
	CrawlerQueueJobDetail,
	CrawlerQueueJobsQuery,
	CrawlerQueueJobsResponse,
	CrawlerStatusDto,
	CrawlerStatsWindow,
	DeleteTrackingVideoResponse,
	DiscoveryFilterConfigDto,
	DiscoverySampleItem,
	DiscoverySampleListQuery,
	DiscoverySampleListResponse,
	DiscoveryStatusDto,
	DiscoverySweepRequest,
	DiscoverySweepResponse,
	IngestVideoRequest,
	IngestVideoResponse,
	LabelDiscoverySampleRequest,
	NetworkRuntimeConfigDocument,
	ProcessRecommendationsResponse,
	PromoteTrackingVideoRequest,
	RecommendationGraphResponse,
	RegisterTrackingVideosRequest,
	RegisterTrackingVideosResponse,
	ReplaceNetworkRuntimeConfigRequest,
	TestNetworkAdapterResponse,
	TrackingVideoListQuery,
	TrackingVideoListResponse,
	UpdateDiscoveryFilterConfigRequest,
	VideoMetadataHistoryListQuery,
	VideoMetadataHistoryListResponse,
	VideoTrackingDto,
} from "@cvsa/contracts";
import type { ApiResult } from "./result";
import { getEdenClient, settle } from "./treaty";

/** Page size shared by the console's paginated tables and the API defaults. */
const DEFAULT_PAGE_SIZE = 20;

async function getStatus(): Promise<ApiResult<CrawlerStatusDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.status.get());
}

async function getStats(
	window: CrawlerStatsWindow = "1h"
): Promise<ApiResult<CrawlerOverviewStats | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.stats.get({ query: { window } }));
}

async function getQueueJobs(
	query?: CrawlerQueueJobsQuery
): Promise<ApiResult<CrawlerQueueJobsResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.jobs.get({ query: query ?? { limit: 50 } }));
}

async function getQueueJobDetail(
	queue: string,
	id: string
): Promise<ApiResult<CrawlerQueueJobDetail | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.jobs({ queue })({ id }).get());
}

async function retryQueueJob(
	queue: string,
	id: string
): Promise<ApiResult<{ ok: boolean } | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.jobs({ queue })({ id }).retry.post());
}

async function removeQueueJob(
	queue: string,
	id: string
): Promise<ApiResult<{ ok: boolean } | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.jobs({ queue })({ id }).delete());
}

async function getClassifierHealth(): Promise<ApiResult<ClassifierHealthDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.classifier.get());
}

async function getDiscoveryStatus(): Promise<ApiResult<DiscoveryStatusDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.discovery.status.get());
}

async function getDiscoveryConfig(): Promise<ApiResult<DiscoveryFilterConfigDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.config.discovery.get());
}

async function updateDiscoveryConfig(
	body: UpdateDiscoveryFilterConfigRequest
): Promise<ApiResult<DiscoveryFilterConfigDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.config.discovery.put(body));
}

async function getNetworkConfig(): Promise<ApiResult<NetworkRuntimeConfigDocument | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.config.network.get());
}

async function updateNetworkConfig(
	body: ReplaceNetworkRuntimeConfigRequest
): Promise<ApiResult<NetworkRuntimeConfigDocument | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.config.network.put(body));
}

async function triggerSweep(
	body: DiscoverySweepRequest
): Promise<ApiResult<DiscoverySweepResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.sweep.post(body));
}

async function triggerHotSample(): Promise<ApiResult<DiscoverySweepResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler["hot-sample"].post());
}

async function fetchDetail(aid: string): Promise<ApiResult<ActionQueuedResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.detail({ aid }).post());
}

async function triggerActive(aid: string): Promise<ApiResult<ActionQueuedResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.active({ aid }).post());
}

async function queueSnapshot(aid: string): Promise<ApiResult<ActionQueuedResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking.videos({ aid }).snapshots.post());
}

async function getTracking(aid: string): Promise<ApiResult<VideoTrackingDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking({ aid }).get());
}

async function deleteTracking(aid: string): Promise<ApiResult<DeleteTrackingVideoResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking({ aid }).delete());
}

async function listTrackingVideos(
	query: Partial<TrackingVideoListQuery> = {}
): Promise<ApiResult<TrackingVideoListResponse | null>> {
	const eden = getEdenClient();
	const params: TrackingVideoListQuery = {
		limit: query.limit ?? DEFAULT_PAGE_SIZE,
		offset: query.offset ?? 0,
		...(query.state ? { state: query.state } : {}),
		...(query.search ? { search: query.search } : {}),
		...(query.statusFilter ? { statusFilter: query.statusFilter } : {}),
		...(query.sortBy ? { sortBy: query.sortBy } : {}),
		...(query.sortOrder ? { sortOrder: query.sortOrder } : {}),
	};
	return settle(await eden.v2.admin.crawler.tracking.videos.get({ query: params }));
}

async function ingestVideo(
	body: IngestVideoRequest
): Promise<ApiResult<IngestVideoResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking.ingest.post(body));
}

async function registerTracking(
	body: RegisterTrackingVideosRequest
): Promise<ApiResult<RegisterTrackingVideosResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking.videos.post(body));
}

async function promoteTracking(
	aid: string,
	body: PromoteTrackingVideoRequest
): Promise<ApiResult<VideoTrackingDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking.videos({ aid }).promote.post(body));
}

async function getRelations(aid: string): Promise<ApiResult<BilibiliVideoRelationDto[] | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.relations({ aid }).get());
}

async function processVideoRecommendations(
	aid: string
): Promise<ApiResult<ProcessRecommendationsResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.recommendations({ aid }).post());
}

async function getRecommendationGraph(
	identifier: string
): Promise<ApiResult<RecommendationGraphResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.graph({ identifier }).get());
}

async function getMetadata(aid: string): Promise<ApiResult<BilibiliVideoMetadataDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.metadata({ aid }).get());
}

async function getMetadataHistory(
	aid: string,
	query: Partial<VideoMetadataHistoryListQuery> = {}
): Promise<ApiResult<VideoMetadataHistoryListResponse | null>> {
	const eden = getEdenClient();
	const params: VideoMetadataHistoryListQuery = {
		limit: query.limit ?? DEFAULT_PAGE_SIZE,
		offset: query.offset ?? 0,
	};
	return settle(await eden.v2.admin.crawler.metadata({ aid }).history.get({ query: params }));
}

async function listDiscoverySamples(
	query: Partial<DiscoverySampleListQuery> = {}
): Promise<ApiResult<DiscoverySampleListResponse | null>> {
	const eden = getEdenClient();
	const params: DiscoverySampleListQuery = {
		limit: query.limit ?? DEFAULT_PAGE_SIZE,
		offset: query.offset ?? 0,
		...(query.decision ? { decision: query.decision } : {}),
		...(query.labeled === undefined ? {} : { labeled: query.labeled }),
		...(query.minConfidence !== undefined ? { minConfidence: query.minConfidence } : {}),
		...(query.maxConfidence !== undefined ? { maxConfidence: query.maxConfidence } : {}),
		...(query.search ? { search: query.search } : {}),
		...(query.sortBy ? { sortBy: query.sortBy } : {}),
		...(query.sortOrder ? { sortOrder: query.sortOrder } : {}),
	};
	return settle(await eden.v2.admin.crawler.discovery.samples.get({ query: params }));
}

async function labelDiscoverySample(
	aid: string,
	humanLabel: 0 | 1
): Promise<ApiResult<DiscoverySampleItem | null>> {
	const eden = getEdenClient();
	const body: LabelDiscoverySampleRequest = { humanLabel };
	return settle(await eden.v2.admin.crawler.discovery.samples({ aid }).label.post(body));
}

async function testNetworkAdapter(
	id: string
): Promise<ApiResult<TestNetworkAdapterResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.network.adapters({ id }).test.post());
}

export const crawlerApi = {
	getStatus,
	getStats,
	getQueueJobs,
	getQueueJobDetail,
	retryQueueJob,
	removeQueueJob,
	getClassifierHealth,
	getDiscoveryStatus,
	getDiscoveryConfig,
	updateDiscoveryConfig,
	getNetworkConfig,
	updateNetworkConfig,
	testNetworkAdapter,
	triggerSweep,
	triggerHotSample,
	fetchDetail,
	triggerActive,
	queueSnapshot,
	getTracking,
	deleteTracking,
	listTrackingVideos,
	ingestVideo,
	registerTracking,
	promoteTracking,
	getRelations,
	processVideoRecommendations,
	getRecommendationGraph,
	getMetadata,
	getMetadataHistory,
	listDiscoverySamples,
	labelDiscoverySample,
};
