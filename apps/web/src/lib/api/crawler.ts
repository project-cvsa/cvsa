/**
 * Crawler Control Plane endpoints (`/admin/crawler/*`).
 */
import type {
	BilibiliVideoMetadataDto,
	BilibiliVideoRelationDto,
	CrawlerStatusDto,
	DiscoveryFilterConfigDto,
	DiscoverySweepRequest,
	DiscoverySweepResponse,
	PromoteTrackingVideoRequest,
	RegisterTrackingVideosRequest,
	RegisterTrackingVideosResponse,
	UpdateDiscoveryFilterConfigRequest,
	VideoTrackingDto,
} from "@cvsa/contracts";
import type { ApiResult } from "./result";
import { getEdenClient, settle } from "./treaty";

type ActionQueuedResponse = {
	queued: boolean;
	aid: string;
};

async function getStatus(): Promise<ApiResult<CrawlerStatusDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.admin.crawler.status.get());
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

export const crawlerApi = {
	getStatus,
	getDiscoveryConfig,
	updateDiscoveryConfig,
	triggerSweep,
	fetchDetail,
	triggerActive,
	getTracking,
	registerTracking,
	promoteTracking,
	getRelations,
	getMetadata,
};
