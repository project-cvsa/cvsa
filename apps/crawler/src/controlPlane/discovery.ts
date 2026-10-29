import { Elysia } from "elysia";
import {
	ActionQueuedResponseSchema,
	BilibiliVideoMetadataDtoSchema,
	BilibiliVideoRelationDtoSchema,
	ClassifierHealthDtoSchema,
	DiscoveryFilterConfigDtoSchema,
	DiscoverySampleItemSchema,
	DiscoverySampleListQuerySchema,
	DiscoverySampleListResponseSchema,
	DiscoveryStatusDtoSchema,
	DiscoverySweepRequestSchema,
	DiscoverySweepResponseSchema,
	DiscoveryQueuedResponseSchema,
	ErrorResponseSchema,
	LabelDiscoverySampleRequestSchema,
	ProcessRecommendationsResponseSchema,
	RecommendationGraphResponseSchema,
	UpdateDiscoveryFilterConfigRequestSchema,
	VideoMetadataHistoryListQuerySchema,
	VideoMetadataHistoryListResponseSchema,
	type BilibiliVideoMetadataDto,
	type BilibiliVideoRelationDto,
	type DiscoveryQueuedResponse,
	type VideoMetadataHistoryItem,
} from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliVideoMetadata, BilibiliVideoRelation } from "@cvsa/snapshot-db";
import { DEFAULT_HOT_SAMPLE_LIMIT } from "../crawler";
import {
	bilibiliClient,
	discoveryFilterService,
	discoveryAdminService,
	discoveryRepository,
	discoveryScheduler,
	discoveryService,
	metadataRefreshScheduler,
	trackingRepository,
	videoClassifierClient,
} from "../container";

function toMetadataDto(m: BilibiliVideoMetadata): BilibiliVideoMetadataDto {
	return {
		aid: m.aid.toString(),
		bvid: m.bvid,
		title: m.title,
		description: m.description,
		pic: m.pic,
		pubdate: m.pubdate ? m.pubdate.toString() : null,
		duration: m.duration,
		mid: m.mid ? m.mid.toString() : null,
		ownerName: m.ownerName,
		ownerFace: m.ownerFace,
		tid: m.tid,
		tname: m.tname,
		copyright: m.copyright,
		cid: m.cid ? m.cid.toString() : null,
		videos: m.videos,
		tidV2: m.tidV2,
		tnameV2: m.tnameV2,
		ctime: m.ctime ? m.ctime.toString() : null,
		descV2: m.descV2,
		state: m.state,
		dynamic: m.Dynamic,
		dimension: m.dimension,
		pages: m.pages,
		staff: m.staff,
		rights: m.rights,
		honorReply: m.honorReply,
		tags: m.tags,
		videoStatus: m.videoStatus,
		filterDecision: m.filterDecision,
		modelScore: m.modelScore,
		modelVersion: m.modelVersion,
		discoverySource: m.discoverySource,
		capturedAt: m.capturedAt.toString(),
		updatedAt: m.updatedAt.toString(),
	};
}

function toRelationDto(r: BilibiliVideoRelation): BilibiliVideoRelationDto {
	return {
		sourceAid: r.sourceAid.toString(),
		targetAid: r.targetAid.toString(),
		position: r.position,
		capturedAt: r.capturedAt.toString(),
	};
}

function toRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value));
}

function toChangeType(value: string): VideoMetadataHistoryItem["changeType"] {
	switch (value) {
		case "created":
		case "status_changed":
			return value;
		default:
			return "updated";
	}
}

function toHistoryItem(row: {
	id: bigint;
	aid: bigint;
	capturedAt: { toString(): string };
	changeType: string;
	changedFields: unknown;
}): VideoMetadataHistoryItem {
	return {
		id: row.id.toString(),
		aid: row.aid.toString(),
		capturedAt: row.capturedAt.toString(),
		changeType: toChangeType(row.changeType),
		changedFields: toRecord(row.changedFields),
	};
}

export const discoveryRoutes = new Elysia()
	.get("/status", () => discoveryAdminService.getStatus(), {
		response: {
			200: DiscoveryStatusDtoSchema,
			401: ErrorResponseSchema,
		},
	})
	.get(
		"/classifier",
		() => {
			return videoClassifierClient.health();
		},
		{
			response: {
				200: ClassifierHealthDtoSchema,
				401: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/config",
		() => {
			return discoveryFilterService.getConfig();
		},
		{
			response: {
				200: DiscoveryFilterConfigDtoSchema,
				401: ErrorResponseSchema,
			},
		}
	)
	.put(
		"/config",
		async ({ body }) => {
			// Await the write so an operator's edit is durable before the request
			// returns; the in-memory filter is updated synchronously either way.
			await discoveryFilterService.updateConfigPersisted(body);
			return discoveryFilterService.getConfig();
		},
		{
			body: UpdateDiscoveryFilterConfigRequestSchema,
			response: {
				200: DiscoveryFilterConfigDtoSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/sweep",
		async ({ body }): Promise<DiscoveryQueuedResponse> => {
			await discoveryScheduler.triggerSearchSweep(body);
			return { queued: true };
		},
		{
			body: DiscoverySweepRequestSchema,
			response: {
				200: DiscoveryQueuedResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/recommendations/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const sourceAid = BigInt(params.aid);
			const result = await discoveryService.processVideoRecommendations(sourceAid);
			return {
				sourceAid: result.sourceAid.toString(),
				relationsCount: result.relationsCount,
				newTracked: result.newTracked,
			};
		},
		{
			response: {
				200: ProcessRecommendationsResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/detail/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			await discoveryScheduler.triggerDetailFetch(BigInt(params.aid), "manual");
			return { queued: true, aid: params.aid };
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/active/:aid",
		async ({ params, status }) => {
			if (!/^(?:\d+|BV[0-9a-z]{10})$/i.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			await discoveryScheduler.triggerActiveDiscovery(params.aid);
			return { queued: true, aid: params.aid };
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/hot-sample",
		async (): Promise<DiscoveryQueuedResponse> => {
			await discoveryScheduler.triggerHotSample(DEFAULT_HOT_SAMPLE_LIMIT);
			return { queued: true };
		},
		{
			response: {
				200: DiscoveryQueuedResponseSchema,
				401: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/metadata/refresh",
		async () => {
			const refreshed = await metadataRefreshScheduler.refreshDue();
			return { totalDiscovered: refreshed, newTracked: 0 };
		},
		{
			response: {
				200: DiscoverySweepResponseSchema,
				401: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/metadata/:aid/refresh",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const aid = BigInt(params.aid);
			const tracking = await trackingRepository.getTracking(aid);
			if (!tracking) {
				return status(404, { code: "NOT_FOUND", message: "Video tracking not found" });
			}
			// The scheduler owns the actual fetch; moving the deadline to now makes
			// the next tick pick this row up without a second trigger path.
			await trackingRepository.updateSchedule(aid, {
				nextSnapshotAt: tracking.nextSnapshotAt,
				nextMetadataAt: toInstant(new Date()),
			});
			return { queued: true, aid: params.aid };
		},
		{
			response: {
				200: ActionQueuedResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/metadata/:aid/history",
		async ({ params, query, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const rows = await discoveryRepository.getMetadataHistory(BigInt(params.aid), 500);
			return {
				items: rows.slice(query.offset, query.offset + query.limit).map(toHistoryItem),
				total: rows.length,
			};
		},
		{
			query: VideoMetadataHistoryListQuerySchema,
			response: {
				200: VideoMetadataHistoryListResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/metadata/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const metadata = await discoveryRepository.getMetadata(BigInt(params.aid));
			if (!metadata) {
				return status(404, { code: "NOT_FOUND", message: "Video metadata not found" });
			}
			return toMetadataDto(metadata);
		},
		{
			response: {
				200: BilibiliVideoMetadataDtoSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/relations/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const relations = await discoveryRepository.getRelationsBySource(BigInt(params.aid));
			return relations.map(toRelationDto);
		},
		{
			response: {
				200: BilibiliVideoRelationDtoSchema.array(),
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/graph/:identifier",
		async ({ params, status }) => {
			let seedAid: bigint | null = null;
			let seedBvid: string | null = null;
			let seedTitle = "未知视频";
			let seedPic: string | null = null;
			let seedOwnerName: string | null = null;
			let seedDuration: number | undefined;

			// 1. Resolve seed video
			if (/^\d+$/.test(params.identifier)) {
				seedAid = BigInt(params.identifier);
				const meta = await discoveryRepository.getMetadata(seedAid);
				if (meta) {
					seedBvid = meta.bvid;
					seedTitle = meta.title;
					seedPic = meta.pic;
					seedOwnerName = meta.ownerName;
					seedDuration = meta.duration;
				}
			}

			// If not in DB or was BVID, fetch from Bilibili
			if (!seedAid || !seedBvid) {
				try {
					const details = await bilibiliClient.getVideoDetails(params.identifier);
					seedAid = BigInt(details.View.aid);
					seedBvid = details.View.bvid;
					seedTitle = details.View.title;
					seedPic = details.View.pic;
					seedOwnerName = details.View.owner?.name ?? null;
					seedDuration = details.View.duration;

					await discoveryRepository.bulkUpsertMetadata([
						{
							aid: seedAid,
							bvid: seedBvid,
							title: seedTitle,
							pic: seedPic,
							duration: seedDuration ?? 0,
							ownerName: seedOwnerName,
							discoverySource: "recommendation-graph-explorer",
						},
					]);
				} catch {
					return status(404, {
						code: "NOT_FOUND",
						message: "Video not found on Bilibili",
					});
				}
			}

			const isSeedTracked = (await trackingRepository.getTracking(seedAid)) !== null;

			// 2. Fetch relations from DB
			let relations = await discoveryRepository.getRelationsBySource(seedAid);

			// If no relations recorded yet, fetch live from Bilibili and persist!
			if (relations.length === 0) {
				try {
					const relatedVideos = await bilibiliClient.getRelatedVideos(seedAid);
					if (relatedVideos.length > 0) {
						await discoveryRepository.bulkUpsertMetadata(
							relatedVideos.map((item) => ({
								aid: BigInt(item.aid),
								bvid: item.bvid,
								title: item.title,
								pic: item.pic,
								duration: item.duration ?? 0,
								ownerName: item.owner?.name ?? null,
								discoverySource: "related",
							}))
						);
						await discoveryRepository.saveRelations(
							relatedVideos.map((item, idx) => ({
								sourceAid: seedAid ?? 0n,
								targetAid: BigInt(item.aid),
								position: idx + 1,
							}))
						);
						relations = await discoveryRepository.getRelationsBySource(seedAid);
					}
				} catch {
					// Fall through with empty relations
				}
			}

			// 3. Fetch metadata and tracking state for all target relations
			const targetAids = relations.map((r) => r.targetAid);
			const targetMetas = await discoveryRepository.getMetadatas(targetAids);
			const metaMap = new Map(targetMetas.map((m) => [m.aid, m]));

			const trackedRows = await trackingRepository.getTrackings(targetAids);
			const trackedSet = new Set(trackedRows.map((r) => r.aid));

			const relationNodes = relations.map((rel) => {
				const meta = metaMap.get(rel.targetAid);
				return {
					aid: rel.targetAid.toString(),
					bvid: meta?.bvid ?? `av${rel.targetAid}`,
					title: meta?.title ?? `Video ${rel.targetAid}`,
					pic: meta?.pic ?? null,
					ownerName: meta?.ownerName ?? null,
					duration: meta?.duration,
					position: rel.position,
					isTracked: trackedSet.has(rel.targetAid),
					capturedAt: rel.capturedAt.toString(),
				};
			});

			return {
				seed: {
					aid: seedAid.toString(),
					bvid: seedBvid,
					title: seedTitle,
					pic: seedPic,
					ownerName: seedOwnerName,
					duration: seedDuration,
					isTracked: isSeedTracked,
				},
				relations: relationNodes,
			};
		},
		{
			response: {
				200: RecommendationGraphResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get("/samples", ({ query }) => discoveryAdminService.listSamples(query), {
		query: DiscoverySampleListQuerySchema,
		response: {
			200: DiscoverySampleListResponseSchema,
			401: ErrorResponseSchema,
			422: ErrorResponseSchema,
		},
	})
	.post(
		"/samples/:aid/label",
		async ({ params, body, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			return discoveryAdminService.label(BigInt(params.aid), body.humanLabel);
		},
		{
			body: LabelDiscoverySampleRequestSchema,
			response: {
				200: DiscoverySampleItemSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	);
