import { Elysia } from "elysia";
import { ErrorResponseSchema } from "@cvsa/contracts";
import { toInstant, type VideoTracking } from "@cvsa/snapshot-db";
import {
	PromoteTrackingVideoRequestSchema,
	RegisterTrackingVideosRequestSchema,
	RegisterTrackingVideosResponseSchema,
	VideoTrackingDtoSchema,
	type VideoTrackingDto,
} from "../crawler";
import { trackingRepository } from "../container";

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
	};
}

export const trackingRoutes = new Elysia()
	.post(
		"/videos",
		async ({ body }) => {
			const now = toInstant(new Date());
			for (const aid of body.aids) {
				await trackingRepository.upsertTracking({
					aid: BigInt(aid),
					state: body.state ?? "regular",
					priority: body.priority ?? 2,
					nextSnapshotAt: now,
				});
			}
			return { registered: body.aids.length };
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
