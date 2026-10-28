import { Elysia } from "elysia";
import {
	AppError,
	ActionQueuedResponseSchema,
	TrackingAidParamsSchema,
	ErrorResponseSchema,
	IngestVideoRequestSchema,
	IngestVideoResponseSchema,
	PromoteTrackingVideoRequestSchema,
	RegisterTrackingVideosRequestSchema,
	RegisterTrackingVideosResponseSchema,
	TrackingVideoListQuerySchema,
	TrackingVideoListResponseSchema,
	VideoTrackingDtoSchema,
	type IngestVideoResponse,
	type TrackingVideoListItem,
	type TrackingVideoListResponse,
	type VideoTrackingDto,
} from "@cvsa/contracts";
import { toInstant, type BilibiliVideoMetadata, type VideoTracking } from "@cvsa/snapshot-db";
import {
	bilibiliClient,
	discoveryRepository,
	manualSnapshotService,
	trackingRepository,
} from "../container";

function toTrackingDto(t: VideoTracking): VideoTrackingDto {
	return {
		aid: t.aid.toString(),
		state: t.state,
		nextSnapshotAt: t.nextSnapshotAt.toString(),
		lastViews: t.lastViews,
		lastCapturedAt: t.lastCapturedAt ? t.lastCapturedAt.toString() : null,
		velocity: t.velocity,
		targetMilestone: t.targetMilestone,
		etaHours: t.etaHours,
		publishedAt: t.publishedAt ? t.publishedAt.toString() : null,
		priority: t.priority,
		consecutiveFails: t.consecutiveFails,
		updatedAt: t.updatedAt.toString(),
		leaseUntil: t.leaseUntil ? t.leaseUntil.toString() : null,
		scheduleReason: t.scheduleReason,
		nextMetadataAt: t.nextMetadataAt ? t.nextMetadataAt.toString() : null,
		lastError: t.lastError,
	};
}

function toTrackingListItemDto(
	t: VideoTracking,
	metadata: BilibiliVideoMetadata | undefined
): TrackingVideoListItem {
	return {
		...toTrackingDto(t),
		...(metadata
			? {
					title: metadata.title,
					bvid: metadata.bvid,
					ownerName: metadata.ownerName,
					videoStatus: metadata.videoStatus,
					filterDecision: metadata.filterDecision,
					discoverySource: metadata.discoverySource,
				}
			: {}),
	};
}

export const trackingRoutes = new Elysia()
	.post(
		"/ingest",
		async ({ body }): Promise<IngestVideoResponse> => {
			const identifier = body.identifier.trim();
			let details: Awaited<ReturnType<typeof bilibiliClient.getVideoDetails>>;
			try {
				details = await bilibiliClient.getVideoDetails(identifier);
			} catch (error) {
				throw new AppError(
					error instanceof Error
						? error.message
						: "Failed to fetch video details from Bilibili",
					"VALIDATION_ERROR",
					422
				);
			}

			const aid = BigInt(details.View.aid);
			const existing = await trackingRepository.getTracking(aid);
			const now = toInstant(new Date());

			await discoveryRepository.bulkUpsertMetadata([
				{
					aid,
					bvid: details.View.bvid,
					title: details.View.title,
					description: details.View.desc ?? null,
					pic: details.View.pic ?? null,
					pubdate: details.View.pubdate
						? toInstant(new Date(details.View.pubdate * 1000))
						: null,
					duration: details.View.duration ?? 0,
					mid: details.View.owner?.mid ? BigInt(details.View.owner.mid) : null,
					ownerName: details.View.owner?.name ?? null,
					ownerFace: details.View.owner?.face ?? null,
					tid: details.View.tid ?? null,
					tname: details.View.tname ?? null,
					tags: details.Tags?.map((t) => t.tag_name) ?? [],
					discoverySource: "manual",
					capturedAt: now,
				},
			]);

			await trackingRepository.upsertTracking({
				aid,
				state: body.state ?? "regular",
				priority: body.priority ?? 2,
				nextSnapshotAt: now,
			});

			return {
				aid: aid.toString(),
				bvid: details.View.bvid,
				title: details.View.title,
				pic: details.View.pic ?? null,
				ownerName: details.View.owner?.name ?? null,
				state: body.state ?? "regular",
				priority: body.priority ?? 2,
				alreadyTracked: Boolean(existing),
			};
		},
		{
			body: IngestVideoRequestSchema,
			response: {
				200: IngestVideoResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/videos",
		async ({ body }) => {
			const now = toInstant(new Date());
			const aids = body.aids;
			const chunkSize = 25;
			for (let i = 0; i < aids.length; i += chunkSize) {
				const chunk = aids.slice(i, i + chunkSize);
				await Promise.all(
					chunk.map((aid) =>
						trackingRepository.upsertTracking({
							aid: BigInt(aid),
							state: body.state ?? "regular",
							priority: body.priority ?? 2,
							nextSnapshotAt: now,
						})
					)
				);
			}
			return { registered: aids.length };
		},
		{
			body: RegisterTrackingVideosRequestSchema,
			response: {
				200: RegisterTrackingVideosResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/videos",
		async ({ query }): Promise<TrackingVideoListResponse> => {
			const result = await trackingRepository.listTrackingVideos({
				limit: query.limit,
				offset: query.offset,
				state: query.state,
				search: query.search,
			});
			const metadatas = await discoveryRepository.getMetadatas(
				result.items.map((item) => item.aid)
			);
			const metadataByAid = new Map(metadatas.map((item) => [item.aid, item]));
			return {
				items: result.items.map((item) =>
					toTrackingListItemDto(item, metadataByAid.get(item.aid))
				),
				total: result.total,
			};
		},
		{
			query: TrackingVideoListQuerySchema,
			response: {
				200: TrackingVideoListResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/videos/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const tracking = await trackingRepository.getTracking(BigInt(params.aid));
			if (!tracking) {
				return status(404, { code: "NOT_FOUND", message: "Video tracking not found" });
			}
			return toTrackingDto(tracking);
		},
		{
			response: {
				200: VideoTrackingDtoSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post("/videos/:aid/snapshots", ({ params }) => manualSnapshotService.enqueue(params.aid), {
		params: TrackingAidParamsSchema,
		response: {
			200: ActionQueuedResponseSchema,
			401: ErrorResponseSchema,
			404: ErrorResponseSchema,
			409: ErrorResponseSchema,
			422: ErrorResponseSchema,
		},
	})
	.post(
		"/videos/:aid/promote",
		async ({ params, body, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const aid = BigInt(params.aid);
			const existing = await trackingRepository.getTracking(aid);
			if (!existing) {
				return status(404, { code: "NOT_FOUND", message: "Video tracking not found" });
			}
			const updated = await trackingRepository.upsertTracking({
				aid,
				state: "milestone",
				targetMilestone: body.targetMilestone ?? existing.targetMilestone,
				priority: body.priority ?? 1,
				nextSnapshotAt: toInstant(new Date()),
			});
			return toTrackingDto(updated);
		},
		{
			body: PromoteTrackingVideoRequestSchema,
			response: {
				200: VideoTrackingDtoSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	);
