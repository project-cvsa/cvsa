import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { NetworkRuntimeConfig } from "../src/crawler";
import { crawlerEnv } from "@cvsa/env";
import { treaty } from "@elysiajs/eden";
import { crawlerControlPlane } from "../src/controlPlane";
import { crawlerMq, crawlerSnapshotDb, networkRuntime } from "../src/container";

const TOKEN = crawlerEnv.CONTROL_API_TOKEN;

if (!TOKEN) {
	throw new Error(
		"CONTROL_API_TOKEN is not configured: copy apps/crawler/.env.example to apps/crawler/.env.test before running the crawler tests"
	);
}

const PROXY_CREDENTIAL = "bob:hunter2@proxy.example.com:8080";
const PROXY_URL = `http://${PROXY_CREDENTIAL}`;

function proxyConfig(baseWeight = 1, proxyUrl = PROXY_URL): NetworkRuntimeConfig {
	return {
		adapters: [
			{
				id: "proxy-a",
				type: "http-proxy",
				proxyUrl,
				enabled: true,
				baseWeight,
				rateLimits: [],
			},
		],
		bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-a"] }],
		requestTypePolicies: {},
	};
}

function mixedConfig(): NetworkRuntimeConfig {
	return {
		...proxyConfig(),
		adapters: [
			...proxyConfig().adapters,
			{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
		],
		bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
	};
}

let lastRawBody = "";

const api = treaty(crawlerControlPlane, {
	// Eden consumes the response body while parsing it, so the raw payload is
	// captured from the clone handed to this hook. Returning nothing keeps Eden's
	// own parsing intact.
	onResponse: async (response) => {
		lastRawBody = await response.text();
	},
});
const runtimeApi = api.v2["network-runtime"];
const authorized = { headers: { authorization: `Bearer ${TOKEN}` } };

async function storedRow() {
	return crawlerSnapshotDb.client.networkRuntimeConfig.findUnique({
		where: { id: "default" },
	});
}

describe("crawler control plane", () => {
	beforeAll(async () => {
		await crawlerSnapshotDb.client.networkRuntimeConfig.deleteMany({});
	});

	afterAll(async () => {
		await networkRuntime.close();
		await crawlerMq.close();
		await crawlerSnapshotDb.disconnect();
	});

	test.serial("runs against the test database, never the development one", () => {
		// This suite deletes rows and rewrites the stored document, so pointing it at
		// local development data by accident would be destructive.
		expect(crawlerEnv.SNAPSHOT_DATABASE_URL).toContain("cvsa_snapshot_test");
	});

	test.serial("rejects a request without an authorization header", async () => {
		const { error, status } = await runtimeApi.status.get();

		expect(status).toBe(401);
		expect(error?.value).toMatchObject({ code: "UNAUTHORIZED" });
	});

	test.serial("rejects a request with the wrong token", async () => {
		const { status } = await runtimeApi.status.get({
			headers: { authorization: "Bearer nope" },
		});

		expect(status).toBe(401);
	});

	test.serial("returns 404 when no configuration is stored", async () => {
		const { error, status } = await runtimeApi.config.get(authorized);

		expect(status).toBe(404);
		expect(error?.value).toMatchObject({ code: "NOT_FOUND" });
	});

	test.serial("creates the initial configuration at revision zero and applies it", async () => {
		const { data, status } = await runtimeApi.config.put(
			{ revision: 0, config: proxyConfig() },
			authorized
		);

		expect(status).toBe(200);
		expect(data?.revision).toBe(1);
		expect(networkRuntime.getStatus()).toMatchObject({ ready: true, revision: 1 });
	});

	test.serial("never returns the proxy credential to the caller", async () => {
		lastRawBody = "";
		const read = await runtimeApi.config.get(authorized);

		expect(read.status).toBe(200);
		expect(lastRawBody).not.toContain("hunter2");
		expect(lastRawBody).toContain("***:***@proxy.example.com:8080");

		lastRawBody = "";
		const write = await runtimeApi.config.put(
			{ revision: 1, config: proxyConfig(2) },
			authorized
		);

		expect(write.status).toBe(200);
		expect(lastRawBody).not.toContain("hunter2");
		expect(lastRawBody).toContain("***:***@proxy.example.com:8080");
	});

	test.serial("rejects a stale revision with a conflict", async () => {
		const { error, status } = await runtimeApi.config.put(
			{ revision: 0, config: proxyConfig() },
			authorized
		);

		expect(status).toBe(409);
		expect(error?.value).toMatchObject({ code: "ENTITY_CONFLICT" });
	});

	test.serial(
		"rejects an unsupported proxy protocol and keeps the running configuration",
		async () => {
			const { error, status } = await runtimeApi.config.put(
				{ revision: 2, config: proxyConfig(1, "socks5://bob:hunter2@127.0.0.1:1080") },
				authorized
			);

			expect(status).toBe(422);
			expect(error?.value).toMatchObject({ code: "VALIDATION_ERROR" });
			expect(networkRuntime.getStatus()).toMatchObject({ ready: true, revision: 2 });
		}
	);

	test.serial("hot-swaps the adapter set without recreating the runtime", async () => {
		const { data, status } = await runtimeApi.config.put(
			{ revision: 2, config: mixedConfig() },
			authorized
		);

		expect(status).toBe(200);
		expect(data?.revision).toBe(3);
		expect(networkRuntime.getStatus().adapters.map((adapter) => adapter.id)).toEqual([
			"proxy-a",
			"direct-a",
		]);
	});

	test.serial("keeps the stored credential across a read-modify-write cycle", async () => {
		const read = await runtimeApi.config.get(authorized);
		expect(JSON.stringify(read.data)).toContain("***:***@proxy.example.com:8080");

		// An operator changes a weight and writes the masked document back.
		const masked = read.data;
		if (!masked) throw new Error("expected a stored configuration document");
		const nextConfig: NetworkRuntimeConfig = {
			...masked.config,
			adapters: masked.config.adapters.map((adapter) => ({ ...adapter, baseWeight: 3 })),
		};
		const write = await runtimeApi.config.put(
			{ revision: masked.revision, config: nextConfig },
			authorized
		);

		expect(write.status).toBe(200);
		const stored = await storedRow();
		expect(JSON.stringify(stored?.config)).toContain(PROXY_CREDENTIAL);
		expect(JSON.stringify(stored?.config)).not.toContain("***:***@");
	});

	test.serial("reports runtime status", async () => {
		const { data, status } = await runtimeApi.status.get(authorized);

		expect(status).toBe(200);
		expect(data?.ready).toBe(true);
		expect(data?.revision).toBe(4);
		expect(data?.adapters.map((adapter) => adapter.id)).toEqual(["proxy-a", "direct-a"]);
	});
});
