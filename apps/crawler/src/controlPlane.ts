import { Elysia } from "elysia";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeStatusSchema,
	PromoteTrackingVideoRequestSchema,
	redactNetworkRuntimeConfigDocument,
	RegisterTrackingVideosRequestSchema,
	RegisterTrackingVideosResponseSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
	VideoTrackingDtoSchema,
	type VideoTrackingDto,
} from "./crawler";
import { AppError, ErrorResponseSchema } from "@cvsa/contracts";
import { crawlerEnv } from "@cvsa/env";
import { toInstant, type VideoTracking } from "@cvsa/snapshot-db";
import { networkRuntime, networkRuntimeConfigService, trackingRepository } from "./container";

function errorResponse(error: AppError): {
	code: "ENTITY_CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_SERVER_ERROR" | "NOT_FOUND";
	message: string;
} {
	if (error.code === "ENTITY_CONFLICT") {
		return { code: "ENTITY_CONFLICT", message: error.message };
	}
	if (error.code === "VALIDATION_ERROR") {
		return { code: "VALIDATION_ERROR", message: error.message };
	}
	if (error.code === "NOT_FOUND") {
		return { code: "NOT_FOUND", message: error.message };
	}
	return { code: "INTERNAL_SERVER_ERROR", message: error.message };
}

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

export const crawlerControlPlane = new Elysia({ name: "crawlerControlPlane", prefix: "/v2" })
	.onError(({ code, error, status }) => {
		if (AppError.isAppError(error)) {
			return status(error.statusCode, errorResponse(error));
		}
		if (code === "VALIDATION") {
			return status(422, { code: "VALIDATION_ERROR", message: "Invalid request" });
		}
		return status(500, { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
	})
	.onBeforeHandle(({ headers, status }) => {
		if (
			!crawlerEnv.CONTROL_API_TOKEN ||
			headers.authorization !== `Bearer ${crawlerEnv.CONTROL_API_TOKEN}`
		) {
			return status(401, { code: "UNAUTHORIZED", message: "Unauthorized" });
		}
	})
	.get(
		"/network-runtime/config",
		async ({ status }) => {
			const config = await networkRuntimeConfigService.get();
			if (!config) {
				return status(404, {
					code: "NOT_FOUND",
					message: "Network runtime config not found",
				});
			}
			// Proxy URLs may embed credentials; they never leave the process.
			return redactNetworkRuntimeConfigDocument(config);
		},
		{
			response: {
				200: NetworkRuntimeConfigDocumentSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	)
	.put(
		"/network-runtime/config",
		async ({ body }) => {
			const config = await networkRuntimeConfigService.replace(body.revision, body.config);
			const applied = networkRuntime.apply(config);
			if (!applied && networkRuntime.getStatus().revision !== config.revision) {
				throw new AppError(
					"Network runtime configuration was saved but could not be applied",
					"INTERNAL_SERVER_ERROR",
					503
				);
			}
			return redactNetworkRuntimeConfigDocument(config);
		},
		{
			body: ReplaceNetworkRuntimeConfigRequestSchema,
			response: {
				200: NetworkRuntimeConfigDocumentSchema,
				401: ErrorResponseSchema,
				409: ErrorResponseSchema,
				422: ErrorResponseSchema,
				503: ErrorResponseSchema,
			},
		}
	)
	.get("/network-runtime/status", () => networkRuntime.getStatus(), {
		response: {
			200: NetworkRuntimeStatusSchema,
			401: ErrorResponseSchema,
		},
	})
	.post(
		"/tracking/videos",
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
		"/tracking/videos/:aid",
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
		"/tracking/videos/:aid/promote",
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
