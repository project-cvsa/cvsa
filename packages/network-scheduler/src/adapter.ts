import axios, { type AxiosProxyConfig, type AxiosRequestConfig, type AxiosResponse } from "axios";
import type { NetworkAdapterConfig } from "./dto";
import type {
	NetworkApplicationErrorClassifier,
	NetworkAdapter,
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
	NetworkTransportResponse,
} from "./contracts";

export interface AxiosNetworkTransportOptions {
	classifyApplicationError?: NetworkApplicationErrorClassifier;
}

function responseHeaders(
	headers: Record<string, string> | AxiosResponse["headers"]
): Record<string, string> {
	const values: Record<string, string> = {};
	if (headers && typeof headers === "object") {
		for (const [key, value] of Object.entries(headers)) {
			if (typeof value === "string") {
				values[key] = value;
			}
		}
	}
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

function parseProxyUrl(proxyUrl: string): AxiosProxyConfig {
	const parsed = new URL(proxyUrl);
	const protocol = parsed.protocol.replace(":", "");
	return {
		protocol,
		host: parsed.hostname,
		port: parsed.port ? Number(parsed.port) : protocol === "https" ? 443 : 80,
		auth: parsed.username
			? { username: parsed.username, password: parsed.password }
			: undefined,
	};
}

export function createAxiosNetworkTransport(
	axiosInstance: typeof axios = axios,
	options: AxiosNetworkTransportOptions = {}
): NetworkTransport {
	return {
		async execute(
			request: NetworkRequest,
			proxyUrl?: string
		): Promise<NetworkTransportResponse> {
			const startedAt = performance.now();
			try {
				const config: AxiosRequestConfig = {
					url: request.url,
					method: request.method ?? "GET",
					headers: request.headers,
					data: request.body,
					timeout: request.timeoutMs,
					responseType: "text",
					validateStatus: () => true,
				};

				if (proxyUrl) {
					config.proxy = parseProxyUrl(proxyUrl);
				}

				const result: AxiosResponse<string> = await axiosInstance(config);
				const body = typeof result.data === "string" ? result.data : "";
				const headers = responseHeaders(result.headers);

				return {
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
						: axios.isAxiosError(error) &&
								(error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
							? "REQUEST_TIMEOUT"
							: "NETWORK_FAILURE";
				return {
					status: 0,
					headers: {},
					body: "",
					durationMs: performance.now() - startedAt,
					errorCode,
				};
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
	constructor(private readonly transport: NetworkTransport = createAxiosNetworkTransport()) {}

	create(config: NetworkAdapterConfig): NetworkAdapter {
		return new ConfiguredNetworkAdapter(config, this.transport);
	}
}
