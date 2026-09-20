import { describe, expect, test } from "bun:test";
import {
	hasRedactedProxyCredentials,
	redactNetworkRuntimeConfig,
	redactNetworkRuntimeConfigDocument,
	redactProxyUrl,
	restoreProxyCredentials,
	type NetworkRuntimeConfig,
} from "../../src/modules/crawler/network";
import {
	NetworkRuntimeConfigDocumentSchema,
	type NetworkRuntimeConfigDocument,
} from "../../src/modules/crawler/dto";

function config(overrides: Partial<NetworkRuntimeConfig> = {}): NetworkRuntimeConfig {
	return {
		adapters: [
			{
				id: "proxy-a",
				type: "http-proxy",
				proxyUrl: "http://127.0.0.1:8080",
				enabled: true,
				baseWeight: 1,
				rateLimits: [],
			},
		],
		bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-a"] }],
		requestTypePolicies: {},
		...overrides,
	};
}

function document(runtimeConfig: NetworkRuntimeConfig): NetworkRuntimeConfigDocument {
	return { revision: 3, config: runtimeConfig, updatedAt: new Date("2024-01-01T00:00:00.000Z") };
}

describe("redactProxyUrl", () => {
	test("masks username and password but keeps the exit identifiable", () => {
		expect(redactProxyUrl("http://bob:hunter2@proxy.example.com:8080")).toBe(
			"http://***:***@proxy.example.com:8080"
		);
	});

	test("masks a username without a password", () => {
		expect(redactProxyUrl("http://bob@proxy.example.com:8080")).toBe(
			"http://***@proxy.example.com:8080"
		);
	});

	test("preserves the scheme, port, and path", () => {
		expect(redactProxyUrl("https://bob:hunter2@proxy.example.com:8443/some/path?x=1")).toBe(
			"https://***:***@proxy.example.com:8443/some/path?x=1"
		);
	});

	test("leaves URLs without credentials untouched", () => {
		for (const proxyUrl of [
			"http://proxy.example.com:8080",
			"https://proxy.example.com",
			"http://[::1]:8080",
			"not-a-url",
		]) {
			expect(redactProxyUrl(proxyUrl)).toBe(proxyUrl);
		}
	});
});

describe("hasRedactedProxyCredentials", () => {
	test("detects the placeholder produced by redactProxyUrl", () => {
		expect(hasRedactedProxyCredentials("http://***:***@proxy.example.com:8080")).toBe(true);
		expect(hasRedactedProxyCredentials("http://***@proxy.example.com:8080")).toBe(true);
	});

	test("does not mistake a real credential for the placeholder", () => {
		for (const proxyUrl of [
			"http://bob:hunter2@proxy.example.com:8080",
			"http://bob@proxy.example.com:8080",
			"http://proxy.example.com:8080",
			// Only the exact placeholder counts: a password that merely contains
			// asterisks is a real credential.
			"http://bob:a***b@proxy.example.com:8080",
			"http://***b:***@proxy.example.com:8080",
		]) {
			expect(hasRedactedProxyCredentials(proxyUrl)).toBe(false);
		}
	});
});

describe("restoreProxyCredentials", () => {
	test("restores the stored userinfo while keeping the submitted host", () => {
		expect(
			restoreProxyCredentials(
				"http://***:***@new-exit.example.com:9090",
				"http://bob:hunter2@old-exit.example.com:8080"
			)
		).toBe("http://bob:hunter2@new-exit.example.com:9090");
	});

	test("keeps path and query from the submitted URL", () => {
		expect(
			restoreProxyCredentials(
				"https://***:***@proxy.example.com:8443/some/path?x=1",
				"http://bob:hunter2@proxy.example.com:8080"
			)
		).toBe("https://bob:hunter2@proxy.example.com:8443/some/path?x=1");
	});

	test("restores a username-only credential", () => {
		expect(restoreProxyCredentials("http://***@proxy.example.com:8080", "http://bob@a:1")).toBe(
			"http://bob@proxy.example.com:8080"
		);
	});

	test("reports when there is nothing to restore", () => {
		expect(
			restoreProxyCredentials(
				"http://***:***@proxy.example.com:8080",
				"http://proxy.example.com"
			)
		).toBeUndefined();
		expect(
			restoreProxyCredentials("http://proxy.example.com:8080", "http://bob:hunter2@a:1")
		).toBeUndefined();
	});

	test("round-trips a redacted URL back to the original credential", () => {
		const original = "http://bob:hunter2@proxy.example.com:8080";
		const redacted = redactProxyUrl(original);

		expect(restoreProxyCredentials(redacted, original)).toBe(original);
	});
});

describe("redactNetworkRuntimeConfig", () => {
	test("redacts proxy credentials and preserves direct adapters", () => {
		const redacted = redactNetworkRuntimeConfig(
			config({
				adapters: [
					{
						id: "proxy-a",
						type: "http-proxy",
						proxyUrl: "http://bob:hunter2@proxy.example.com:8080",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 2,
						rateLimits: [],
					},
				],
			})
		);

		expect(redacted.adapters[0]).toMatchObject({
			id: "proxy-a",
			proxyUrl: "http://***:***@proxy.example.com:8080",
		});
		expect(redacted.adapters[1]).toEqual({
			id: "direct-a",
			type: "direct",
			enabled: true,
			baseWeight: 2,
			rateLimits: [],
		});
	});

	test("does not mutate the input configuration", () => {
		const original = config({
			adapters: [
				{
					id: "proxy-a",
					type: "http-proxy",
					proxyUrl: "http://bob:hunter2@proxy.example.com:8080",
					enabled: true,
					baseWeight: 1,
					rateLimits: [],
				},
			],
		});

		redactNetworkRuntimeConfig(original);

		expect(original.adapters[0]).toMatchObject({
			proxyUrl: "http://bob:hunter2@proxy.example.com:8080",
		});
	});

	test("produces a document that still satisfies the API response schema", () => {
		const redacted = redactNetworkRuntimeConfigDocument(
			document(
				config({
					adapters: [
						{
							id: "proxy-a",
							type: "http-proxy",
							proxyUrl: "https://bob:hunter2@proxy.example.com:8443",
							enabled: true,
							baseWeight: 1,
							rateLimits: [],
						},
					],
				})
			)
		);

		expect(NetworkRuntimeConfigDocumentSchema.safeParse(redacted).success).toBe(true);
	});

	test("never leaves a credential in the serialized output", () => {
		const serialized = JSON.stringify(
			redactNetworkRuntimeConfigDocument(
				document(
					config({
						adapters: [
							{
								id: "proxy-a",
								type: "http-proxy",
								proxyUrl: "http://bob:hunter2@proxy.example.com:8080",
								enabled: true,
								baseWeight: 1,
								rateLimits: [],
							},
						],
					})
				)
			)
		);

		expect(serialized).not.toContain("hunter2");
		expect(serialized).not.toContain("bob:");
	});
});
