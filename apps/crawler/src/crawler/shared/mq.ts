import { boundedOperation } from "./boundedOperation";
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
	let operationTimeoutMs = 3000;
	const connection = new IORedis(redisUrl, {
		// BullMQ requires null for its worker connection; commandTimeout still
		// bounds every command, and task operations also observe cancellation.
		maxRetriesPerRequest: null,
		commandTimeout: operationTimeoutMs,
		connectTimeout: 3000,
		enableOfflineQueue: false,
	});
	const bounded = <T>(work: () => Promise<T>) => boundedOperation(work, operationTimeoutMs);
	const queues: Array<Pick<Queue<unknown>, "close" | "waitUntilReady">> = [];
	const workers: Array<Pick<Worker<unknown>, "close">> = [];
	const workerControllers: AbortController[] = [];
	const logError = (error: Error) =>
		appLogger.warn("Crawler Redis operation failed", {
			component: "crawler-mq",
			message: error.message,
		});
	connection.on("error", logError);

	return {
		setOperationTimeout(timeoutMs) {
			operationTimeoutMs = timeoutMs;
			connection.options.commandTimeout = timeoutMs;
		},
		async connect(): Promise<void> {
			await bounded(async () => {
				if (connection.status === "connecting" || connection.status === "connect")
					await new Promise<void>((resolve, reject) => {
						const ready = () => {
							connection.off("error", failed);
							resolve();
						};
						const failed = (error: Error) => {
							connection.off("ready", ready);
							reject(error);
						};
						connection.once("ready", ready);
						connection.once("error", failed);
					});
				await connection.ping();
			});
			appLogger.info("Crawler MQ connected", { component: "crawler-mq" });
		},

		createQueue<T>(name: string, options: JobsOptions = {}): CrawlerQueue<T> {
			const queue = new Queue<T, unknown, string, T, unknown, string>(name, {
				connection,
				prefix,
				defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...options },
			});
			queue.on("error", logError);
			queues.push(queue);
			return {
				add: async (jobName: string, data: T, jobOptions?: JobsOptions): Promise<void> => {
					assertTaskActive();
					await bounded(() => queue.add(jobName, data, jobOptions));
				},
				getJobCounts: async (): Promise<CrawlerJobCounts> => {
					const counts = await bounded(() =>
						queue.getJobCounts(
							"waiting",
							"active",
							"delayed",
							"failed",
							"completed",
							"prioritized"
						)
					);
					return {
						waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
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
					const bullJobs = await bounded(() =>
						queue.getJobs(types, start, start + limit - 1)
					);
					return Promise.all(
						bullJobs.map(async (job) => {
							const state = await bounded(() => job.getState());
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
					const job = await bounded(() => queue.getJob(id));
					if (!job) return null;
					const state = await bounded(() => job.getState());
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
					const job = await bounded(() => queue.getJob(id));
					if (!job) return false;
					await bounded(() => job.retry());
					return true;
				},
				removeJob: async (id: string): Promise<boolean> => {
					const job = await bounded(() => queue.getJob(id));
					if (!job) return false;
					await bounded(() => job.remove());
					return true;
				},
				close: () => bounded(() => queue.close()),
			};
		},

		createWorker<T>(
			name: string,
			processor: CrawlerProcessor<T>,
			options: Omit<WorkerOptions, "connection"> = {}
		): CrawlerWorker {
			let taskTimeoutMs = 120_000;
			const controller = new AbortController();
			workerControllers.push(controller);
			const worker = new Worker<T>(
				name,
				async (job, token) => {
					const crawlerJob: CrawlerJob<T> = {
						id: job.id ?? undefined,
						data: job.data,
						updateData: (data) => {
							assertTaskActive();
							return bounded(() => job.updateData(data));
						},
						updateProgress: (progress) => {
							assertTaskActive();
							return bounded(() => job.updateProgress(progress));
						},
					};
					await runTaskWithDeadline(
						taskTimeoutMs,
						async () => {
							try {
								await processor(crawlerJob);
							} catch (error) {
								if (!(error instanceof RetryLaterError)) throw error;
								await bounded(() =>
									job.moveToDelayed(
										Date.now() + Math.max(1, error.delayMs),
										token
									)
								);
								throw new DelayedError();
							}
						},
						controller.signal
					);
				},
				{ drainDelay: 0.1, ...options, connection, prefix }
			);
			worker.on("error", logError);
			workers.push(worker);
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
				close: (force = true) => {
					controller.abort(new Error("Crawler worker stopped"));
					return bounded(() => worker.close(force));
				},
			};
		},

		async close(): Promise<void> {
			for (const controller of workerControllers)
				controller.abort(new Error("Crawler MQ stopped"));
			connection.disconnect();
			await Promise.allSettled(queues.map((queue) => bounded(() => queue.waitUntilReady())));
			await Promise.allSettled(workers.map((worker) => bounded(() => worker.close(true))));
			await Promise.allSettled(queues.map((queue) => bounded(() => queue.close())));
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
