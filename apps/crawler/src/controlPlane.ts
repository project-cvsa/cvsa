import { Elysia } from "elysia";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeStatusSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
	redactNetworkRuntimeConfigDocument,
} from "@cvsa/core/crawler";
import { AppError, ErrorResponseSchema } from "@cvsa/core";
import { crawlerEnv } from "@cvsa/env";
import { networkRuntime, networkRuntimeConfigService } from "./container";

function errorResponse(error: AppError): {
	code: "ENTITY_CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_SERVER_ERROR";
	message: string;
} {
	if (error.code === "ENTITY_CONFLICT") {
		return { code: "ENTITY_CONFLICT", message: error.message };
	}
	if (error.code === "VALIDATION_ERROR") {
		return { code: "VALIDATION_ERROR", message: error.message };
	}
	return { code: "INTERNAL_SERVER_ERROR", message: error.message };
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
	});
