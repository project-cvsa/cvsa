import { describe, expect, test } from "bun:test";
import type axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { AdapterRegistry, createAxiosNetworkTransport } from "../src/adapter";

function mockResponse(status: number, body: string): AxiosResponse<string> {
	return {
		status,
		data: body,
		headers: {},
		config: { headers: {} } as AxiosResponse["config"],
		statusText: "OK",
	};
}

describe("createAxiosNetworkTransport", () => {
	test("passes proxy config when a proxy URL is provided", async () => {
		let receivedConfig: AxiosRequestConfig | undefined;
		const axiosInstance = (config: AxiosRequestConfig) => {
			receivedConfig = config;
			return Promise.resolve(mockResponse(200, "proxied"));
		};
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios);

		const result = await transport.execute(
			{ url: "https://example.com/resource", requestType: "test" },
			"http://proxy.example.com:8080"
		);

		expect(result.status).toBe(200);
		expect(result.body).toBe("proxied");
		expect(receivedConfig?.proxy).toEqual({
			protocol: "http",
			host: "proxy.example.com",
			port: 8080,
			auth: undefined,
		});
	});

	test("does not configure a proxy for direct requests", async () => {
		let receivedConfig: AxiosRequestConfig | undefined;
		const axiosInstance = (config: AxiosRequestConfig) => {
			receivedConfig = config;
			return Promise.resolve(mockResponse(200, "direct"));
		};
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios);

		const result = await transport.execute({
			url: "https://example.com/resource",
			requestType: "test",
		});

		expect(result.status).toBe(200);
		expect(result.body).toBe("direct");
		expect(receivedConfig?.proxy).toBeUndefined();
	});

	test("sends the request through the configured proxy", async () => {
		let proxiedRequestUrl: string | undefined;
		const proxy = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				proxiedRequestUrl = request.url;
				return new Response("served by proxy", {
					headers: { "content-type": "text/plain" },
				});
			},
		});

		try {
			const transport = createAxiosNetworkTransport();
			const result = await transport.execute(
				{
					url: "http://unresolvable.test/resource?source=network-scheduler",
					requestType: "test",
				},
				`http://127.0.0.1:${proxy.port}`
			);

			expect(result).toMatchObject({ status: 200, body: "served by proxy" });
			if (proxiedRequestUrl === undefined) {
				throw new Error("the proxy did not receive the request");
			}
			// The default port is normalized away before the request reaches the
			// proxy, so compare the parsed target instead of the raw URL string.
			const proxied = new URL(proxiedRequestUrl);
			expect(proxied.protocol).toBe("http:");
			expect(proxied.hostname).toBe("unresolvable.test");
			expect(proxied.pathname).toBe("/resource");
			expect(proxied.search).toBe("?source=network-scheduler");
		} finally {
			proxy.stop(true);
		}
	});

	test("does not interpret application payloads without a classifier", async () => {
		const axiosInstance = () => Promise.resolve(mockResponse(200, '{"code":-1}'));
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios);

		await expect(
			transport.execute({ url: "https://example.com/resource", requestType: "test" })
		).resolves.toMatchObject({ errorCode: undefined });
	});

	test("delegates application error interpretation to the caller", async () => {
		const axiosInstance = () => Promise.resolve(mockResponse(200, '{"error":"quota"}'));
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios, {
			classifyApplicationError: ({ body }) =>
				body.includes("quota") ? "APPLICATION_ERROR" : undefined,
		});

		await expect(
			transport.execute({ url: "https://example.com/resource", requestType: "test" })
		).resolves.toMatchObject({ errorCode: "APPLICATION_ERROR" });
	});

	test("consults the classifier before falling back to a generic 4xx", async () => {
		const axiosInstance = () => Promise.resolve(mockResponse(412, "risk control"));
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios, {
			classifyApplicationError: ({ status }) =>
				status === 412 ? "APPLICATION_RATE_LIMIT" : undefined,
		});

		await expect(
			transport.execute({ url: "https://example.com/resource", requestType: "test" })
		).resolves.toMatchObject({ errorCode: "APPLICATION_RATE_LIMIT", status: 412 });
	});

	test("keeps the generic 4xx code when the classifier does not recognize the response", async () => {
		const axiosInstance = () => Promise.resolve(mockResponse(404, "not found"));
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios, {
			classifyApplicationError: () => undefined,
		});

		await expect(
			transport.execute({ url: "https://example.com/resource", requestType: "test" })
		).resolves.toMatchObject({ errorCode: "HTTP_4XX" });
	});

	test("never lets the classifier override the HTTP 429 and 5xx codes", async () => {
		const tooManyRequestsInstance = () => Promise.resolve(mockResponse(429, "slow down"));
		const serverErrorInstance = () => Promise.resolve(mockResponse(503, "unavailable"));
		const tooManyRequests = createAxiosNetworkTransport(
			tooManyRequestsInstance as unknown as typeof axios,
			{ classifyApplicationError: () => "APPLICATION_ERROR" }
		);
		const serverError = createAxiosNetworkTransport(
			serverErrorInstance as unknown as typeof axios,
			{ classifyApplicationError: () => "APPLICATION_ERROR" }
		);

		await expect(
			tooManyRequests.execute({ url: "https://example.com/resource" })
		).resolves.toMatchObject({ errorCode: "HTTP_429" });
		await expect(
			serverError.execute({ url: "https://example.com/resource" })
		).resolves.toMatchObject({ errorCode: "HTTP_5XX" });
	});

	test("handles network failures gracefully", async () => {
		const axiosInstance = () => {
			const error = new Error("Network error");
			Object.defineProperty(error, "name", { value: "Error" });
			return Promise.reject(error);
		};
		const transport = createAxiosNetworkTransport(axiosInstance as unknown as typeof axios);

		const result = await transport.execute({
			url: "https://example.com/resource",
			requestType: "test",
		});
		expect(result.errorCode).toBe("NETWORK_FAILURE");
		expect(result.status).toBe(0);
	});
});

describe("AdapterRegistry", () => {
	test("adds the adapter id after transport execution", async () => {
		const registry = new AdapterRegistry({
			async execute() {
				return {
					status: 200,
					headers: {},
					body: "custom transport",
					durationMs: 1,
				};
			},
		});
		const adapter = registry.create({
			id: "custom",
			type: "direct",
			enabled: true,
			baseWeight: 1,
			rateLimits: [],
		});

		await expect(
			adapter.execute({ url: "https://example.com", requestType: "test" })
		).resolves.toMatchObject({ adapterId: "custom", body: "custom transport" });
	});
});
