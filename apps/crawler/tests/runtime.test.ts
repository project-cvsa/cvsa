import { MetadataRefreshScheduler } from "../src/controlPlane/metadataRefresh";
import type { VideoTracking } from "@cvsa/snapshot-db";
import { describe, expect, test } from "bun:test";
import { createCrawlerMetrics, createCrawlerRuntime } from "../src/crawler";
import { createFakeMq, createFakeSnapshotDb } from "../src/crawler/testing";

describe("crawler runtime", () => {
	test("starts dependencies and shuts them down gracefully", async () => {
		const mq = createFakeMq();
		const snapshotDb = createFakeSnapshotDb();
		let initialized = false;
		let shutdown = false;
		let dispatcherStarted = false;
		let dispatcherStopped = false;
		let workerClosed = false;

		const runtime = createCrawlerRuntime({
			mq,
			snapshotDb,
			metrics: createCrawlerMetrics(),
			dispatcher: {
				start() {
					dispatcherStarted = true;
				},
				stop() {
					dispatcherStopped = true;
				},
			},
			worker: {
				async close() {
					workerClosed = true;
				},
			},
			observability: {
				async init(): Promise<void> {
					initialized = true;
				},
				async shutdown(): Promise<void> {
					shutdown = true;
				},
			},
		});

		await runtime.start();
		expect(initialized).toBe(true);
		expect(snapshotDb.connected).toBe(true);
		expect(snapshotDb.healthChecks).toBe(1);
		expect(mq.state.connected).toBe(true);
		expect(dispatcherStarted).toBe(true);

		await runtime.shutdown();
		expect(shutdown).toBe(true);
		expect(snapshotDb.disconnected).toBe(true);
		expect(mq.state.closed).toBe(true);
		expect(dispatcherStopped).toBe(true);
		expect(workerClosed).toBe(true);
	});
	test("releases dependencies when final metrics persistence fails", async () => {
		const mq = createFakeMq();
		const snapshotDb = createFakeSnapshotDb();
		let telemetryStopped = false;
		const runtime = createCrawlerRuntime({
			mq,
			snapshotDb,
			statsCollector: {
				startPeriodicFlush() {},
				stopPeriodicFlush() {},
				async flush() {
					throw new Error("metrics write failed");
				},
			},
			observability: {
				async init() {},
				async shutdown() {
					telemetryStopped = true;
				},
			},
		});
		await runtime.start();
		await expect(runtime.shutdown()).rejects.toThrow("metrics write failed");
		expect(mq.state.closed).toBe(true);
		expect(snapshotDb.disconnected).toBe(true);
		expect(telemetryStopped).toBe(true);
	});
	test("waits for a metadata refresh already in progress before completing shutdown", async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<VideoTracking[]>();
		const scheduler = new MetadataRefreshScheduler({
			async listDueMetadata() {
				entered.resolve();
				return release.promise;
			},
			trackingRepository: { async updateSchedule() {} },
			discoveryRepository: {
				async upsertMetadata() {
					throw new Error("No metadata expected");
				},
			},
			bilibiliClient: {
				async getVideoDetails() {
					throw new Error("No details expected");
				},
			},
		});
		const finished: string[] = [];
		const refresh = scheduler.refreshDue().then(() => {
			finished.push("refreshed");
		});
		await entered.promise;
		const closed = scheduler.close().then(() => {
			finished.push("closed");
		});
		expect(finished).toEqual([]);
		release.resolve([]);
		await Promise.all([refresh, closed]);
		expect(finished).toEqual(["refreshed", "closed"]);
	});
});
