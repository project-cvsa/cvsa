import { assertTaskActive, runTaskWithDeadline } from "./taskContext";
import {
	Queue,
	Worker,
	DelayedError,
	type JobType,
	type JobsOptions,
	type WorkerOptions,
} from "bullmq";
import { RetryLaterError } from "./retryLater";
import IORedis from "ioredis";
import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import type {
	CrawlerJob,
	CrawlerJobCounts,
	CrawlerMq,
	CrawlerProcessor,
	CrawlerQueue,
	CrawlerQueueJobSnapshot,
	CrawlerWorker,
} from "./types";

const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 3,
	backoff: { type: "exponential", delay: 1_000 },
	removeOnComplete: true,
	removeOnFail: { age: 24 * 60 * 60, count: 1_000 },
};

export function createCrawlerMq(redisUrl = crawlerEnv.REDIS_URL, prefix = "bull"): CrawlerMq {
	const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
	const queues: Array<Queue<unknown>> = [];
	const workers: Array<Worker<unknown>> = [];

	return {
		async connect(): Promise<void> {
			await connection.ping();
			appLogger.info("Crawler MQ connected", { component: "crawler-mq" });
		},

		createQueue<T>(name: string, options: JobsOptions = {}): CrawlerQueue<T> {
			const queue = new Queue<T, unknown, string, T, unknown, string>(name, {
				connection,
				prefix,
				defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...options },
			});
			queues.push(queue as Queue<unknown>);
			return {
				add: async (jobName: string, data: T, jobOptions?: JobsOptions): Promise<void> => {
					assertTaskActive();
					await queue.add(jobName, data, jobOptions);
				},
				getJobCounts: async (): Promise<CrawlerJobCounts> => {
					const counts = await queue.getJobCounts(
						"waiting",
						"active",
						"delayed",
						"failed",
						"completed"
					);
					return {
						waiting: counts.waiting ?? 0,
						active: counts.active ?? 0,
						delayed: counts.delayed ?? 0,
						failed: counts.failed ?? 0,
						completed: counts.completed ?? 0,
					};
				},
				getJobs: async (
					types: JobType[] = ["active", "waiting", "delayed", "failed"],
					limit = 50,
					offset = 0
				): Promise<CrawlerQueueJobSnapshot[]> => {
					// BullMQ reads a negative range (limit <= 0) as "from the end of the
					// list", so an explicitly empty page must short-circuit instead of
					// returning a stray job.
					if (limit <= 0) return [];
					const start = Math.max(0, offset);
					const bullJobs = await queue.getJobs(types, start, start + limit - 1);
					return Promise.all(
						bullJobs.map(async (job) => {
							const state = await job.getState();
							return {
								id: job.id ?? "unknown",
								name: job.name,
								data: job.data,
								state,
								attempts: job.attemptsMade,
								failedReason: job.failedReason ?? null,
								timestamp: job.timestamp,
								progress: job.progress,
								processedOn: job.processedOn ?? null,
								finishedOn: job.finishedOn ?? null,
							};
						})
					);
				},
				getJobDetail: async (id: string) => {
					const job = await queue.getJob(id);
					if (!job) return null;
					const state = await job.getState();
					return {
						id: job.id ?? id,
						name: job.name,
						data: job.data,
						state,
						attempts: job.attemptsMade,
						failedReason: job.failedReason ?? null,
						timestamp: job.timestamp,
						progress: job.progress,
						processedOn: job.processedOn ?? null,
						finishedOn: job.finishedOn ?? null,
						opts: job.opts,
						stacktrace: job.stacktrace ?? null,
						returnvalue: job.returnvalue,
					};
				},
				retryJob: async (id: string): Promise<boolean> => {
					const job = await queue.getJob(id);
					if (!job) return false;
					await job.retry();
					return true;
				},
				removeJob: async (id: string): Promise<boolean> => {
					const job = await queue.getJob(id);
					if (!job) return false;
					await job.remove();
					return true;
				},
				close: () => queue.close(),
			};
		},

		createWorker<T>(
			name: string,
			processor: CrawlerProcessor<T>,
			options: Omit<WorkerOptions, "connection"> = {}
		): CrawlerWorker {
			let taskTimeoutMs = 120_000;
			const worker = new Worker<T>(
				name,
				async (job, token) => {
					const crawlerJob: CrawlerJob<T> = {
						id: job.id ?? undefined,
						data: job.data,
						updateData: (data) => {
							assertTaskActive();
							return job.updateData(data);
						},
						updateProgress: (progress) => {
							assertTaskActive();
							return job.updateProgress(progress);
						},
					};
					try {
						await runTaskWithDeadline(taskTimeoutMs, () => processor(crawlerJob));
					} catch (error) {
						if (!(error instanceof RetryLaterError)) throw error;
						await job.moveToDelayed(Date.now() + Math.max(1, error.delayMs), token);
						throw new DelayedError();
					}
				},
				{ ...options, connection, prefix }
			);
			workers.push(worker as Worker<unknown>);
			worker.on("failed", (job, error) => {
				appLogger.error("Crawler MQ job failed", {
					component: "crawler-mq",
					jobId: job?.id,
					error,
				});
			});
			return {
				setTaskTimeout: (timeoutMs) => {
					taskTimeoutMs = timeoutMs;
				},
				setConcurrency: (concurrency) => {
					worker.concurrency = concurrency;
				},
				close: (force = true) => worker.close(force),
			};
		},

		async close(): Promise<void> {
			await Promise.all(workers.map((worker) => worker.close(true)));
			await Promise.all(queues.map((queue) => queue.close()));
			try {
				await Promise.race([
					connection.quit(),
					new Promise((resolve) => setTimeout(resolve, 300)),
				]);
			} catch {
				// ignored
			}
			connection.disconnect();
			appLogger.info("Crawler MQ closed", { component: "crawler-mq" });
		},
	};
}
