import { describe, expect, test } from "bun:test";
import fetch, { Response, type RequestInit } from "node-fetch";
import { ProxyAgent } from "proxy-agent";
import { createFetchNetworkTransport } from "../src/adapter";

describe("createFetchNetworkTransport", () => {
	test("passes a proxy agent to the fetch implementation", async () => {
		let receivedInit: RequestInit | undefined;
		const fetchImplementation: typeof fetch = async (_url, init) => {
			receivedInit = init;
			return new Response("proxied", { status: 200 });
		};
		const transport = createFetchNetworkTransport(fetchImplementation);

		const result = await transport.execute(
			{ url: "https://example.com/resource", requestType: "test" },
			"socks5://proxy.example.com:1080"
		);

		expect(result.status).toBe(200);
		expect(result.body).toBe("proxied");
		expect(receivedInit?.agent).toBeInstanceOf(ProxyAgent);
	});

	test("does not create a proxy agent for direct requests", async () => {
		let receivedInit: RequestInit | undefined;
		const fetchImplementation: typeof fetch = async (_url, init) => {
			receivedInit = init;
			return new Response("direct", { status: 200 });
		};
		const transport = createFetchNetworkTransport(fetchImplementation);

		const result = await transport.execute({
			url: "https://example.com/resource",
			requestType: "test",
		});

		expect(result.status).toBe(200);
		expect(result.body).toBe("direct");
		expect(receivedInit?.agent).toBeUndefined();
	});
});
