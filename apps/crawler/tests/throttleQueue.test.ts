import { waitUntil } from "./support/async";
import { expect, test } from "bun:test";
import { createCrawlerMq } from "../src/crawler/shared/mq";
import { RetryLaterError } from "../src/crawler/shared/retryLater";

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
	try {
		await mq.connect();
		mq.createWorker<{ offset: number }>(
			name,
			async (job) => {
				starts++;
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
