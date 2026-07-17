import { z } from "zod";
import type { NetworkAdapterConfig } from "./dto";
import type {
	NetworkAdapter,
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./contracts";

const BilibiliEnvelopeSchema = z.object({ code: z.number() }).passthrough();

function responseHeaders(headers: Headers): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [key, value] of headers.entries()) values[key] = value;
	return values;
}

function toErrorCode(status: number, body: string): NetworkResponse["errorCode"] {
	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		if (status === 429) return "HTTP_429";
		if (status >= 500) return "HTTP_5XX";
		if (status >= 400) return "HTTP_4XX";
		return undefined;
	}
	if (status === 429) return "HTTP_429";
	if (status >= 500) return "HTTP_5XX";
	if (status >= 400) return "HTTP_4XX";
	const bilibiliEnvelope = BilibiliEnvelopeSchema.safeParse(parsedBody);
	if (bilibiliEnvelope.success && bilibiliEnvelope.data.code !== 0) return "BILIBILI_API_ERROR";
	return undefined;
}

export function createFetchNetworkTransport(): NetworkTransport {
	return {
		async execute(request: NetworkRequest, proxyUrl?: string): Promise<NetworkResponse> {
			const startedAt = performance.now();
			const controller = new AbortController();
			const timeout = request.timeoutMs
				? setTimeout(() => controller.abort(), request.timeoutMs)
				: undefined;
			try {
				const init = {
					method: request.method ?? "GET",
					headers: request.headers,
					body: request.body,
					signal: controller.signal,
					proxy: proxyUrl,
				};
				const result = await fetch(request.url, init);
				const body = await result.text();
				return {
					adapterId: "",
					status: result.status,
					headers: responseHeaders(result.headers),
					body,
					durationMs: performance.now() - startedAt,
					errorCode: toErrorCode(result.status, body),
				};
			} catch (error) {
				const errorCode =
					error instanceof DOMException && error.name === "AbortError"
						? "REQUEST_TIMEOUT"
						: "NETWORK_FAILURE";
				return {
					adapterId: "",
					status: 0,
					headers: {},
					body: "",
					durationMs: performance.now() - startedAt,
					errorCode,
				};
			} finally {
				if (timeout) clearTimeout(timeout);
			}
		},
	};
}

class ConfiguredNetworkAdapter implements NetworkAdapter {
	readonly id: string;

	constructor(
		private readonly config: NetworkAdapterConfig,
		private readonly transport: NetworkTransport
	) {
		this.id = config.id;
	}

	async execute(request: NetworkRequest): Promise<NetworkResponse> {
		const proxyUrl = this.config.type === "direct" ? undefined : this.config.proxyUrl;
		const response = await this.transport.execute(request, proxyUrl);
		return { ...response, adapterId: this.id };
	}
}

export class AdapterRegistry {
	constructor(private readonly transport: NetworkTransport = createFetchNetworkTransport()) {}

	create(config: NetworkAdapterConfig): NetworkAdapter {
		return new ConfiguredNetworkAdapter(config, this.transport);
	}
}
