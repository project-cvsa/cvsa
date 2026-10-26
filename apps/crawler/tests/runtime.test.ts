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
});
