import { waitUntil } from "./support/async";
import { expect, test } from "bun:test";
import { createCrawlerMq } from "../src/crawler/shared/mq";
import { RetryLaterError } from "../src/crawler/shared/retryLater";
import { BilibiliClient } from "../src/crawler/bilibili";
import {
	createDiscoveryQueue,
	createDiscoveryWorker,
	DiscoveryPipelineProcessor,
} from "../src/crawler/discovery/worker";
import {
	InMemoryDiscoveryRepository,
	InMemoryTrackingRepository,
} from "../src/crawler/testing/fakes";

test("discovery uses the configured execution limit and saves retries on the same job", async () => {
	const mq = createCrawlerMq(undefined, `discovery-retry-${crypto.randomUUID()}`);
	const queue = createDiscoveryQueue(mq);
	let calls = 0;
	const client = new BilibiliClient({
		request: async (url, options) => {
			if (url.includes("view/detail")) {
				calls++;
				throw new Error("Connection failed");
			}
			const data = url.includes("finger/spi")
				? { b_3: "device3", b_4: "device4" }
				: { ticket: "ticket", nav: { img: "a".repeat(32), sub: "b".repeat(32) } };
			return {
				status: 200,
				headers: {},
				body: options?.method === "HEAD" ? "" : JSON.stringify({ code: 0, data }),
			};
		},
	});
	const processor = new DiscoveryPipelineProcessor(
		client,
		new InMemoryDiscoveryRepository(),
		new InMemoryTrackingRepository(),
		queue
	);
	try {
		await mq.connect();
		createDiscoveryWorker(mq, processor, 1, undefined, () => ({
			maxAttempts: 2,
			baseDelayMs: 100,
			maxDelayMs: 100,
		}));
		await queue.add(
			"detail",
			{ type: "fetch-video-details", aid: "42", source: "manual" },
			{ jobId: "original" }
		);
		await waitUntil(
			async () => (await queue.getJobCounts()).failed === 1,
			"configured discovery retry limit"
		);
		expect((await queue.getJobDetail("original"))?.data).toMatchObject({ failureAttempts: 2 });
		expect(calls).toBe(2);
	} finally {
		await mq.close();
	}
});

test("throttled jobs release active slots without using failure attempts", async () => {
	const mq = createCrawlerMq();
	const name = `throttle-test-${crypto.randomUUID()}`;
	const queue = mq.createQueue<{ throttle: boolean }>(name);
	let completed = false;
	try {
		await mq.connect();
		mq.createWorker<{ throttle: boolean }>(
			name,
			async (job) => {
				if (job.data.throttle) throw new RetryLaterError(30_000);
				completed = true;
			},
			{ concurrency: 1 }
		);
		await queue.add("throttled", { throttle: true }, { removeOnComplete: false });
		await queue.add("healthy", { throttle: false }, { removeOnComplete: false });
		await waitUntil(
			async () => (await queue.getJobCounts()).completed === 1,
			"healthy job completion"
		);
		expect(completed).toBe(true);
		const jobs = await queue.getJobs(["delayed"]);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.attempts).toBe(0);
		expect((await queue.getJobCounts()).active).toBe(0);
	} finally {
		const remaining = await queue.getJobs(["delayed", "waiting", "completed", "failed"]);
		for (const job of remaining) await queue.removeJob(job.id);
		await mq.close();
	}
});

test("a delayed job resumes with saved data and finishes without failed attempts", async () => {
	const mq = createCrawlerMq();
	const name = `resume-test-${crypto.randomUUID()}`;
	const queue = mq.createQueue<{ offset: number }>(name);
	let completed = false;
	let starts = 0;
	const readyTimes: number[] = [];
	try {
		await mq.connect();
		mq.createWorker<{ offset: number }>(
			name,
			async (job) => {
				starts++;
				readyTimes.push(job.enqueuedAt ?? 0);
				if (job.data.offset === 0) {
					await job.updateData?.({ offset: 1 });
					throw new RetryLaterError(30, "local_capacity");
				}
				completed = true;
			},
			{ concurrency: 1 }
		);
		await queue.add("resume", { offset: 0 }, { removeOnComplete: false });
		await waitUntil(
			async () => (await queue.getJobCounts()).completed === 1,
			"resumed job completion"
		);
		const jobs = await queue.getJobs(["completed"]);
		expect(completed).toBe(true);
		expect(starts).toBe(2);
		expect(readyTimes[1]).toBeGreaterThan(readyTimes[0] ?? 0);
		expect(jobs[0]?.attempts).toBe(1);
		expect((await queue.getJobCounts()).failed).toBe(0);
	} finally {
		for (const job of await queue.getJobs(["delayed", "waiting", "completed", "failed"]))
			await queue.removeJob(job.id);
		await mq.close();
	}
});

test("a hung job expires and the same worker can process the next job", async () => {
	const mq = createCrawlerMq();
	const name = `deadline-test-${crypto.randomUUID()}`;
	const queue = mq.createQueue<{ hang: boolean }>(name);
	let completed = false;
	try {
		await mq.connect();
		const worker = mq.createWorker<{ hang: boolean }>(
			name,
			async (job) => {
				if (job.data.hang) await new Promise<void>(() => {});
				else completed = true;
			},
			{ concurrency: 1 }
		);
		worker.setTaskTimeout?.(30);
		await queue.add("hang", { hang: true }, { attempts: 1 });
		await queue.add("next", { hang: false }, { removeOnComplete: false });
		await waitUntil(async () => {
			const counts = await queue.getJobCounts();
			return counts.completed === 1 && counts.failed === 1 && counts.active === 0;
		}, "deadline recovery and next job completion");
		expect(completed).toBe(true);
		const counts = await queue.getJobCounts();
		expect(counts.active).toBe(0);
		expect(counts.failed).toBe(1);
	} finally {
		for (const job of await queue.getJobs(["delayed", "waiting", "completed", "failed"]))
			await queue.removeJob(job.id);
		await mq.close();
	}
});
