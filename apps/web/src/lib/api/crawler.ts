/**
 * Crawler Control Plane endpoints (`/admin/crawler/*`).
 */
import type {
	ActionQueuedResponse,
	BilibiliVideoMetadataDto,
	BilibiliVideoRelationDto,
	ClassifierHealthDto,
	CrawlerOverviewStats,
	CrawlerStatusDto,
	CrawlerStatsWindow,
	DiscoveryFilterConfigDto,
	DiscoverySampleItem,
	DiscoverySampleListQuery,
	DiscoverySampleListResponse,
	DiscoverySweepRequest,
	DiscoverySweepResponse,
	LabelDiscoverySampleRequest,
	NetworkRuntimeConfigDocument,
	PromoteTrackingVideoRequest,
	RegisterTrackingVideosRequest,
	RegisterTrackingVideosResponse,
	ReplaceNetworkRuntimeConfigRequest,
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

async function getClassifierHealth(): Promise<ApiResult<ClassifierHealthDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.classifier.get());
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

async function fetchDetail(aid: string): Promise<ApiResult<ActionQueuedResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.detail({ aid }).post());
}

async function triggerActive(aid: string): Promise<ApiResult<ActionQueuedResponse | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.active({ aid }).post());
}

async function getTracking(aid: string): Promise<ApiResult<VideoTrackingDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.tracking({ aid }).get());
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
	};
	return settle(await eden.v2.admin.crawler.tracking.videos.get({ query: params }));
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

export const crawlerApi = {
	getStatus,
	getStats,
	getClassifierHealth,
	getDiscoveryConfig,
	updateDiscoveryConfig,
	getNetworkConfig,
	updateNetworkConfig,
	triggerSweep,
	fetchDetail,
	triggerActive,
	getTracking,
	listTrackingVideos,
	registerTracking,
	promoteTracking,
	getRelations,
	getMetadata,
	getMetadataHistory,
	listDiscoverySamples,
	labelDiscoverySample,
};
