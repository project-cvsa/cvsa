import { expect, test } from "bun:test";
import {
	AdapterRegistry,
	createAxiosNetworkTransport,
	createRedisRateLimiter,
	NetworkRuntimeConfigSchema,
} from "@cvsa/network-scheduler";
import { BilibiliClient } from "../src/crawler/bilibili";
import { NetworkRuntimeConfigManager } from "../src/crawler/network/config";
import { classifyBilibiliResponse } from "../src/crawler/network/bilibiliClassifier";

import { createSnapshotDb, toInstant } from "@cvsa/snapshot-db";
import { TrackingRepository } from "../src/crawler/tracking/repository";
import { createCrawlerMq } from "../src/crawler/shared/mq";
import type { CrawlerMq } from "../src/crawler/shared/types";
import {
	createDiscoveryQueue,
	createDiscoveryWorker,
	DiscoveryPipelineProcessor,
	type DiscoveryJobData,
} from "../src/crawler/discovery/worker";
import { InMemoryTrackingRepository } from "../src/crawler/testing/fakes";
import { waitUntil } from "./support/async";
import { InMemoryDiscoveryRepository } from "../src/crawler/testing/fakes";
import { createBilibiliProtocolServer } from "./support/bilibiliProtocolServer";

function runtime(baseUrl: string) {
	const transport = createAxiosNetworkTransport(undefined, {
		classifyApplicationError: classifyBilibiliResponse,
	});
	const registry = new AdapterRegistry({
		execute: (request, proxyUrl, observer) =>
			transport.execute(
				{
					...request,
					url: baseUrl + new URL(request.url).pathname + new URL(request.url).search,
				},
				proxyUrl,
				observer
			),
	});
	const manager = new NetworkRuntimeConfigManager(
		{
			async get() {
				return null;
			},
			async create() {
				return null;
			},
			async replace() {
				return null;
			},
		},
		registry,
		createRedisRateLimiter(process.env.REDIS_URL ?? "redis://127.0.0.1:6379")
	);
	const config = NetworkRuntimeConfigSchema.parse({
		adapters: [
			{ id: `recovery-${crypto.randomUUID()}`, type: "direct", requestsPerSecond: 20 },
		],
		bindings: [],
		execution: { throttleCooldownMs: 500, throttleJitterMs: 0, admissionTimeoutMs: 2000 },
	});
	config.bindings = [
		{ requestType: "bilibili-api", adapterIds: config.adapters.map((item) => item.id) },
	];
	manager.apply({ revision: 1, config, updatedAt: new Date() });
	return { manager, config };
}

test("concurrent cold starts finish with one credential initialization through real admission", async () => {
	const server = createBilibiliProtocolServer();
	const { manager } = runtime(server.baseUrl);
	try {
		const client = new BilibiliClient({ networkDelegate: manager });
		const results = await Promise.all(
			Array.from({ length: 8 }, () => client.searchVideos("test"))
		);
		expect(results.every((result) => result.code === 0)).toBe(true);
		expect(
			server.getCalls().filter((call) => call.path === "/x/frontend/finger/spi")
		).toHaveLength(1);
		expect(server.getCalls().filter((call) => call.path.includes("GenWebTicket"))).toHaveLength(
			1
		);
	} finally {
		await manager.close();
		await server.close();
	}
});

test("search survives worker replacement with persisted progress and no missing or duplicate candidates", async () => {
	let blocked = false;
	const pages = 3;
	const candidates = Array.from({ length: pages }, (_, index) => ({
		aid: 500100 + index,
		bvid: `BV${index}`,
		title: `candidate ${index}`,
		duration: "03:00",
	}));
	const server = createBilibiliProtocolServer({
		responseFactory: (request) => {
			if (!request.path.includes("/search/type")) return undefined;
			const page = Number(new URLSearchParams(request.search).get("page"));
			if (page === 2 && !blocked) {
				blocked = true;
				return { status: 429, body: { code: -509 } };
			}
			return { body: { code: 0, data: { result: [candidates[page - 1]] } } };
		},
	});
	const { manager } = runtime(server.baseUrl);
	const mq = createCrawlerMq();
	const namespace = `search-recovery-${crypto.randomUUID()}`;
	const scopedMq: CrawlerMq = {
		...mq,
		createQueue(name, options) {
			return mq.createQueue(`${namespace}-${name}`, options);
		},
		createWorker(name, processor, options) {
			return mq.createWorker(`${namespace}-${name}`, processor, options);
		},
	};
	const queue = createDiscoveryQueue(scopedMq);
	const details = mq.createQueue<DiscoveryJobData>(`${namespace}-details`);
	const repo = new InMemoryDiscoveryRepository();
	const tracking = new InMemoryTrackingRepository();
	const processor = () =>
		new DiscoveryPipelineProcessor(
			new BilibiliClient({ networkDelegate: manager }),
			repo,
			tracking,
			details
		);
	let worker = createDiscoveryWorker(scopedMq, processor(), 1);
	try {
		await mq.connect();
		await queue.add(
			"search",
			{
				type: "search-sweep",
				config: { keywords: ["test"], orders: ["pubdate"], pagesPerQuery: pages },
			},
			{ removeOnComplete: false, attempts: 1 }
		);
		await waitUntil(
			async () => (await queue.getJobCounts()).delayed === 1,
			"search job deferral"
		);
		await worker.close();
		worker = createDiscoveryWorker(scopedMq, processor(), 1);
		await waitUntil(async () => {
			const counts = await queue.getJobCounts();
			if (counts.failed) throw new Error("Search job failed instead of resuming");
			return counts.completed === 1;
		}, "replacement worker completion");
		const detailJobs = await details.getJobs(["waiting"]);
		expect(
			detailJobs
				.map((job) => job.data)
				.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
		).toEqual(
			candidates.map((candidate) => ({
				type: "fetch-video-details",
				aid: String(candidate.aid),
				source: "search",
				origin: {
					channel: "search",
					capturedAt: expect.any(String),
					search: {
						keyword: "test",
						order: "pubdate",
						page: expect.any(Number),
						position: 1,
						categoryId: null,
					},
				},
			}))
		);
		expect(
			server
				.getCalls()
				.filter((call) => call.path.includes("/search/type"))
				.map((call) => new URLSearchParams(call.search).get("page"))
		).toEqual(["1", "2", "2", "3"]);
		expect((await queue.getJobCounts()).failed).toBe(0);
	} finally {
		await worker.close();
		for (const target of [queue, details])
			for (const job of await target.getJobs(["waiting", "delayed", "completed", "failed"]))
				await target.removeJob(job.id);
		await mq.close();
		await manager.close();
		await server.close();
	}
});

test("a timed-out worker cannot submit a late write through the real repository", async () => {
	const db = createSnapshotDb();
	await db.connect();
	const repository = new TrackingRepository(db.client);
	const target = 990_000_000_000_777n;
	const gate = Promise.withResolvers<void>();
	const settled = Promise.withResolvers<void>();
	const mq = createCrawlerMq();
	const queueName = `late-write-${crypto.randomUUID()}`;
	const queue = mq.createQueue<Record<string, never>>(queueName);
	const worker = mq.createWorker<Record<string, never>>(
		queueName,
		async () => {
			try {
				await gate.promise;
				await repository.upsertTracking({
					aid: target,
					nextSnapshotAt: toInstant(new Date()),
				});
			} finally {
				settled.resolve();
			}
		},
		{ concurrency: 1 }
	);
	worker.setTaskTimeout?.(30);
	try {
		await repository.deleteTracking(target);
		await queue.add("late-write", {}, { attempts: 1 });
		await waitUntil(async () => (await queue.getJobCounts()).failed === 1, "task timeout");
		gate.resolve();
		await settled.promise;
		expect(await repository.getTracking(target)).toBeNull();
	} finally {
		gate.resolve();
		await worker.close();
		for (const job of await queue.getJobs(["waiting", "delayed", "completed", "failed"]))
			await queue.removeJob(job.id);
		await mq.close();
		await repository.deleteTracking(target);
		await db.disconnect();
	}
});

test("Bilibili throttling defers tracking and diagnostics through the same admission path", async () => {
	const server = createBilibiliProtocolServer({
		responseFactory: (request) =>
			request.path.includes("search/type")
				? { body: { code: -352, message: "Request frequency is limited" } }
				: undefined,
	});
	const { manager } = runtime(server.baseUrl);
	const client = new BilibiliClient({ networkDelegate: manager });
	try {
		await expect(client.searchVideos("test")).rejects.toMatchObject({ reason: "upstream" });
		await expect(client.bulkGetVideoStats([100])).rejects.toMatchObject({ reason: "upstream" });
		const adapterId = manager.getStatus().adapters[0].id;
		await expect(client.diagnostic(adapterId)).rejects.toMatchObject({ reason: "upstream" });
		expect(
			server
				.getCalls()
				.filter(
					(call) => call.path.includes("resource/infos") || call.path.endsWith("/nav")
				)
		).toHaveLength(0);
		expect(server.getCalls().filter((call) => call.path.includes("finger/spi"))).toHaveLength(
			1
		);
		expect((await manager.getStatusWithCooldowns()).adapters[0]).toMatchObject({
			healthState: "healthy",
			consecutiveFailures: 0,
			adaptiveFactor: 0.7,
		});
	} finally {
		await client.stop();
		await manager.close();
		await server.close();
	}
});

test("database handles retained before expiry cannot submit writes after task cancellation", async () => {
	const { assertTaskActive, runTaskWithDeadline } = await import(
		"../src/crawler/shared/taskContext"
	);
	const { videoTracking } = await import("@cvsa/snapshot-db");
	const { eq } = await import("drizzle-orm");
	const db = createSnapshotDb(undefined, { beforeQuery: assertTaskActive });
	const aid = 9_000_000_000_000_975n;
	let resume: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	let rejected = false;
	let finished: Promise<void> = Promise.resolve();
	try {
		await expect(
			runTaskWithDeadline(30, () => {
				const retained = db.client;
				finished = (async () => {
					await gate;
					try {
						await retained
							.insert(videoTracking)
							.values({ aid, nextSnapshotAt: toInstant(new Date()) });
					} catch {
						rejected = true;
					}
				})();
				return finished;
			})
		).rejects.toThrow("deadline");
		resume();
		await finished;
		expect(rejected).toBe(true);
		expect(
			await db.client.select().from(videoTracking).where(eq(videoTracking.aid, aid))
		).toHaveLength(0);
	} finally {
		resume();
		await db.disconnect();
	}
});
