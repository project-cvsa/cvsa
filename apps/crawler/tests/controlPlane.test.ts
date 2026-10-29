import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { NetworkRuntimeConfig } from "../src/crawler";
import { toInstant } from "@cvsa/snapshot-db";
import { crawlerEnv } from "@cvsa/env";
import { treaty } from "@elysiajs/eden";
import { crawlerControlPlane } from "../src/controlPlane";
import {
	crawlerMq,
	crawlerSnapshotDb,
	discoveryRepository,
	networkRuntime,
	trackingRepository,
} from "../src/container";

const TOKEN = crawlerEnv.CONTROL_API_TOKEN;

if (!TOKEN) {
	throw new Error(
		"CONTROL_API_TOKEN is not configured: copy apps/crawler/.env.example to apps/crawler/.env.test before running the crawler tests"
	);
}

const PROXY_CREDENTIAL = "bob:hunter2@proxy.example.com:8080";
const PROXY_URL = `http://${PROXY_CREDENTIAL}`;

const TRACKING_AID = 9_100_000_000_000_001n;
const SAMPLE_AID = 9_100_000_000_000_002n;
const METADATA_AID = 9_100_000_000_000_003n;
const TOUCHED_AIDS = [TRACKING_AID, SAMPLE_AID, METADATA_AID];

async function cleanupSeededRows(): Promise<void> {
	const client = crawlerSnapshotDb.client;
	for await (const _ of client.orm.public.BilibiliVideoMetadataHistory.where((row) =>
		row.aid.in(TOUCHED_AIDS)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.BilibiliVideoMetadata.where((row) =>
		row.aid.in(TOUCHED_AIDS)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.DiscoverySample.where((row) =>
		row.aid.in(TOUCHED_AIDS)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.VideoTracking.where((row) =>
		row.aid.in(TOUCHED_AIDS)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.CrawlerRuntimeConfig.where({
		key: "discovery",
	}).deleteAll()) {
		// drained
	}
}

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
	return crawlerSnapshotDb.client.orm.public.NetworkRuntimeConfig.where({
		id: "default",
	}).first();
}

describe("crawler control plane", () => {
	beforeAll(async () => {
		await crawlerSnapshotDb.client.orm.public.NetworkRuntimeConfig.where({
			id: "default",
		}).deleteAll();
		await cleanupSeededRows();
	});

	afterAll(async () => {
		await cleanupSeededRows();
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

	test.serial("answers an unmatched route with a 404 error body instead of 500", async () => {
		const response = await crawlerControlPlane.handle(
			new Request("http://localhost/v2/stats", { headers: authorized.headers })
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
	});

	test.serial("answers an unmatched route with 404 before any token check", async () => {
		const response = await crawlerControlPlane.handle(
			new Request("http://localhost/v2/stats/not-a-route")
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
	});

	test.serial("still rejects a known route without a token", async () => {
		const response = await crawlerControlPlane.handle(
			new Request("http://localhost/v2/stats/overview?window=5m")
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
	});

	test.serial("maps a malformed query to 422 VALIDATION_ERROR", async () => {
		const response = await crawlerControlPlane.handle(
			new Request("http://localhost/v2/stats/overview?window=bogus", {
				headers: authorized.headers,
			})
		);

		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
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

	test.serial("serves the stats overview for a window", async () => {
		const { data, status } = await api.v2.stats.overview.get({
			query: { window: "5m" },
			...authorized,
		});

		expect(status).toBe(200);
		expect(data?.window).toBe("5m");
		expect(data?.queues).toBeDefined();
		expect(data?.latencyMs).toMatchObject({
			taskP95: expect.any(Number),
			apiP95: expect.any(Number),
			inferenceP95: expect.any(Number),
		});
		expect(Array.isArray(data?.series)).toBe(true);
	});

	test.serial("persists a discovery config update through the repository", async () => {
		const { data, status } = await api.v2.discovery.config.put(
			{ modelThreshold: 0.42 },
			authorized
		);

		expect(status).toBe(200);
		expect(data?.modelThreshold).toBe(0.42);

		const stored = await crawlerSnapshotDb.client.orm.public.CrawlerRuntimeConfig.where({
			key: "discovery",
		}).first();
		expect(stored?.config).toMatchObject({ modelThreshold: 0.42 });
	});

	test.serial("lists tracking videos with lease and metadata scheduling fields", async () => {
		await trackingRepository.upsertTracking({
			aid: TRACKING_AID,
			state: "new",
			nextSnapshotAt: toInstant(new Date()),
			nextMetadataAt: toInstant(new Date(Date.now() + 60 * 60 * 1_000)),
			lastError: "seed-error",
		});

		const { data, status } = await api.v2.tracking.videos.get({
			query: { limit: 5, offset: 0, search: TRACKING_AID.toString() },
			...authorized,
		});

		expect(status).toBe(200);
		const item = data?.items.find((row) => row.aid === TRACKING_AID.toString());
		expect(item).toBeDefined();
		expect(item?.leaseUntil).toBeNull();
		expect(item?.scheduleReason).toBe("initial");
		expect(item?.nextMetadataAt).not.toBeNull();
		expect(item?.lastError).toBe("seed-error");
	});

	test.serial("returns the metadata change history for a video", async () => {
		await discoveryRepository.upsertMetadata({
			aid: METADATA_AID,
			bvid: `BV${METADATA_AID}`,
			title: "history seed",
		});

		const { data, status } = await api.v2.discovery
			.metadata({ aid: METADATA_AID.toString() })
			.history.get({ query: { limit: 10, offset: 0 }, ...authorized });

		expect(status).toBe(200);
		expect(data?.total).toBeGreaterThanOrEqual(1);
		expect(data?.items[0]).toMatchObject({
			aid: METADATA_AID.toString(),
			changeType: "created",
		});
	});

	test.serial("lists discovery samples and applies a human label", async () => {
		await discoveryRepository.upsertSample({
			aid: SAMPLE_AID,
			bvid: `BV${SAMPLE_AID}`,
			title: "sample seed",
			decision: "model_rejected",
			modelVersion: "test-model",
			probabilities: [0.1, 0.9],
			songProbability: 0.9,
		});

		const list = await api.v2.discovery.samples.get({
			query: { limit: 5, offset: 0, decision: "model_rejected" },
			...authorized,
		});

		expect(list.status).toBe(200);
		const item = list.data?.items.find((row) => row.aid === SAMPLE_AID.toString());
		expect(item).toBeDefined();
		expect(item?.probabilities).toEqual({ class_0: 0.1, class_1: 0.9 });
		expect(item?.capturedAt).not.toBeNull();

		const labeled = await api.v2.discovery
			.samples({ aid: SAMPLE_AID.toString() })
			.label.post({ humanLabel: 1 }, authorized);

		expect(labeled.status).toBe(200);
		expect(labeled.data?.humanLabel).toBe(1);
		expect(labeled.data?.labeledAt).not.toBeNull();
	});
});
