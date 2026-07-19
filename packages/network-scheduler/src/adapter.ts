import fetch, { type RequestInit } from "node-fetch";
import { ProxyAgent } from "proxy-agent";
import type { NetworkAdapterConfig } from "./dto";
import type {
	NetworkApplicationErrorClassifier,
	NetworkAdapter,
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./contracts";

export interface FetchNetworkTransportOptions {
	classifyApplicationError?: NetworkApplicationErrorClassifier;
}

function responseHeaders(headers: Iterable<readonly [string, string]>): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [key, value] of headers) values[key] = value;
	return values;
}

function toErrorCode(
	status: number,
	headers: Record<string, string>,
	body: string,
	classifyApplicationError?: NetworkApplicationErrorClassifier
): NetworkResponse["errorCode"] {
	if (status === 429) return "HTTP_429";
	if (status >= 500) return "HTTP_5XX";
	if (status >= 400) return "HTTP_4XX";
	return classifyApplicationError?.({ status, headers, body });
}

export function createFetchNetworkTransport(
	fetchImplementation: typeof fetch = fetch,
	options: FetchNetworkTransportOptions = {}
): NetworkTransport {
	const proxyAgents = new Map<string, ProxyAgent>();

	return {
		async execute(request: NetworkRequest, proxyUrl?: string): Promise<NetworkResponse> {
			const startedAt = performance.now();
			const controller = new AbortController();
			const timeout = request.timeoutMs
				? setTimeout(() => controller.abort(), request.timeoutMs)
				: undefined;
			try {
				let agent: ProxyAgent | undefined;
				if (proxyUrl) {
					agent = proxyAgents.get(proxyUrl);
					if (!agent) {
						agent = new ProxyAgent({ getProxyForUrl: () => proxyUrl });
						proxyAgents.set(proxyUrl, agent);
					}
				}
				const init: RequestInit = {
					method: request.method ?? "GET",
					headers: request.headers,
					body: request.body,
					signal: controller.signal,
					agent,
				};
				const result = await fetchImplementation(request.url, init);
				const body = await result.text();
				const headers = responseHeaders(result.headers);
				return {
					adapterId: "",
					status: result.status,
					headers,
					body,
					durationMs: performance.now() - startedAt,
					errorCode: toErrorCode(
						result.status,
						headers,
						body,
						options.classifyApplicationError
					),
				};
			} catch (error) {
				const errorCode =
					error instanceof Error && error.name === "AbortError"
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
