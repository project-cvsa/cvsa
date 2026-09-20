import { describe, expect, test } from "bun:test";
import { HealthConfigSchema, NetworkRuntimeConfigSchema } from "../src";

function configWithProxyUrl(proxyUrl: string): unknown {
	return {
		adapters: [
			{
				id: "proxy-a",
				type: "http-proxy",
				proxyUrl,
				enabled: true,
				baseWeight: 1,
				rateLimits: [],
			},
		],
		bindings: [{ requestType: "test", adapterIds: ["proxy-a"] }],
		requestTypePolicies: {},
	};
}

describe("HttpProxyAdapterConfigSchema", () => {
	test("accepts http and https proxy URLs, with or without credentials", () => {
		for (const proxyUrl of [
			"http://127.0.0.1:8080",
			"http://user:secret@proxy.example.com:8080",
			"https://proxy.example.com",
			"https://user@proxy.example.com:443/path",
		]) {
			expect(NetworkRuntimeConfigSchema.safeParse(configWithProxyUrl(proxyUrl)).success).toBe(
				true
			);
		}
	});

	test("rejects every other proxy protocol", () => {
		for (const proxyUrl of [
			"socks5://127.0.0.1:1080",
			"socks4://127.0.0.1:1080",
			"ftp://proxy.example.com",
			"file:///tmp/proxy",
			"ws://proxy.example.com:8080",
		]) {
			const result = NetworkRuntimeConfigSchema.safeParse(configWithProxyUrl(proxyUrl));
			expect(result.success).toBe(false);
		}
	});

	test("rejects values that are not URLs at all", () => {
		const result = NetworkRuntimeConfigSchema.safeParse(
			configWithProxyUrl("proxy.example.com")
		);
		expect(result.success).toBe(false);
	});
});

describe("HealthConfigSchema", () => {
	test("defaults isolation thresholds", () => {
		const parsed = HealthConfigSchema.parse({});
		expect(parsed.failureThreshold).toBe(3);
		expect(parsed.cooldownMs).toBe(30_000);
	});

	test("rejects a non-positive cooldown", () => {
		expect(HealthConfigSchema.safeParse({ cooldownMs: 0 }).success).toBe(false);
	});
});
