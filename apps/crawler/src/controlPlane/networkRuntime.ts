import { Elysia } from "elysia";
import { ErrorResponseSchema, TestNetworkAdapterResponseSchema } from "@cvsa/contracts";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeStatusSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
	redactNetworkRuntimeConfigDocument,
} from "../crawler";
import { adapterProbeService, networkRuntime, networkRuntimeConfigService } from "../container";

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
			const config = await networkRuntimeConfigService.replaceAndApply(
				body.revision,
				body.config,
				networkRuntime
			);
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
	.get("/status", () => networkRuntime.getStatusWithCooldowns(), {
		response: {
			200: NetworkRuntimeStatusSchema,
			401: ErrorResponseSchema,
		},
	})
	.post("/adapters/:id/test", ({ params }) => adapterProbeService.test(params.id), {
		response: {
			200: TestNetworkAdapterResponseSchema,
			401: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
	});
