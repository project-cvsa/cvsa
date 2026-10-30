import { Elysia } from "elysia";
import { AppError, ErrorResponseSchema, TestNetworkAdapterResponseSchema } from "@cvsa/contracts";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeStatusSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
	redactNetworkRuntimeConfigDocument,
} from "../crawler";
import { crawlerAdapterRegistry, networkRuntime, networkRuntimeConfigService } from "../container";

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
	.get("/status", () => networkRuntime.getStatusWithCooldowns(), {
		response: {
			200: NetworkRuntimeStatusSchema,
			401: ErrorResponseSchema,
		},
	})
	.post(
		"/adapters/:id/test",
		async ({ params, status }) => {
			const configDoc = await networkRuntimeConfigService.get();
			const adapterConfig = configDoc?.config.adapters.find((a) => a.id === params.id);
			if (!adapterConfig) {
				return status(404, {
					code: "NOT_FOUND",
					message: `Adapter ${params.id} not found`,
				});
			}
			const adapter = crawlerAdapterRegistry.create(adapterConfig);
			const start = Date.now();
			try {
				const res = await adapter.execute({
					url: "https://api.bilibili.com/x/web-interface/nav",
					requestType: "bilibili-api",
					method: "GET",
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						Referer: "https://www.bilibili.com/",
					},
					timeoutMs: 8000,
				});
				const latencyMs = Date.now() - start;
				return {
					adapterId: params.id,
					ok: res.status >= 200 && res.status < 400 && res.errorCode === undefined,
					status: res.status,
					latencyMs,
					error:
						res.status >= 400 || res.errorCode !== undefined
							? `HTTP ${res.status}${res.errorCode ? `: ${res.errorCode}` : ""}`
							: undefined,
				};
			} catch (err) {
				const latencyMs = Date.now() - start;
				return {
					adapterId: params.id,
					ok: false,
					latencyMs,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		},
		{
			response: {
				200: TestNetworkAdapterResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
