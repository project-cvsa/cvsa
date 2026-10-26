import { Elysia } from "elysia";
import { AppError, ErrorResponseSchema } from "@cvsa/contracts";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeStatusSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
	redactNetworkRuntimeConfigDocument,
} from "../crawler";
import { networkRuntime, networkRuntimeConfigService } from "../container";

export const networkRuntimeRoutes = new Elysia()
	.get(
		"/config",
		async ({ status }) => {
			const config = await networkRuntimeConfigService.get();
			if (!config) {
				return status(404, {
					code: "NOT_FOUND",
					message: "Network runtime config not found",
				});
			}
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
		"/config",
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
	.get("/status", () => networkRuntime.getStatus(), {
		response: {
			200: NetworkRuntimeStatusSchema,
			401: ErrorResponseSchema,
		},
	});
