import { boundedOperation } from "./boundedOperation";
import {
	assertTaskActive,
	drainActiveTasks,
	runTaskWithDeadline,
	TaskDeadlineError,
} from "./taskContext";
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
import { context, propagation } from "@opentelemetry/api";
import { crawlerEnv } from "@cvsa/env";
import { appLogger, withLogContext } from "@cvsa/logger";
import type { StatsRecorder } from "../stats/types";
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

function queueReadyAt(data: unknown): number | undefined {
	if (
		typeof data === "object" &&
		data !== null &&
		"_queueReadyAt" in data &&
		typeof data._queueReadyAt === "number"
	)
		return data._queueReadyAt;
	return undefined;
}

export function createCrawlerMq(
	redisUrl = crawlerEnv.REDIS_URL,
	prefix = "bull",
	stats?: StatsRecorder
): CrawlerMq {
	let operationTimeoutMs = 3000;
	const connection = new IORedis(redisUrl, {
		// BullMQ requires maxRetriesPerRequest: null.
		// Note: commandTimeout MUST NOT be set on the shared Redis connection because
		// BullMQ workers use blocking operations (e.g. bzpopmin) to wait for new jobs.
		// Setting commandTimeout causes worker blocking commands to abort every N seconds,
		// leading to command timeouts, worker stalling, and starvation of idle queues.
		maxRetriesPerRequest: null,
		connectTimeout: 3000,
		enableOfflineQueue: false,
	});
	const bounded = async <T>(work: () => Promise<T>, command = "command"): Promise<T> => {
		const startedAt = performance.now();
		try {
			const result = await boundedOperation(work, operationTimeoutMs);
			stats?.recordRedis("mq", command, performance.now() - startedAt, "success");
			return result;
		} catch (error) {
			const outcome =
				error instanceof Error && error.name === "AbortError" ? "cancelled" : "failure";
			stats?.recordRedis("mq", command, performance.now() - startedAt, outcome);
			throw error;
		}
	};
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
					let payload = data;
					if (typeof data === "object" && data !== null) {
						const carrier: Record<string, string> = {};
						propagation.inject(context.active(), carrier);
						if (Object.keys(carrier).length > 0) {
							payload = { ...data, _traceCarrier: carrier };
						}
					}
					stats?.record("enqueueCalls");
					try {
						await bounded(() => queue.add(jobName, payload, jobOptions), "add");
						stats?.record("enqueueSucceeded");
					} catch (error) {
						stats?.record("enqueueFailed");
						throw error;
					}
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
						prioritized: counts.prioritized ?? 0,
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
					const singleState = types.length === 1 ? types[0] : undefined;
					return Promise.all(
						bullJobs.map(async (job) => {
							const state =
								singleState ?? (await bounded(() => job.getState(), "getJobState"));
							return {
								id: job.id ?? "unknown",
								name: job.name,
								data: job.data,
								state,
								attempts: job.attemptsMade,
								failedReason: job.failedReason ?? null,
								timestamp: job.timestamp,
								readyAt: queueReadyAt(job.data),
								progress: job.progress,
								processedOn: job.processedOn ?? null,
								finishedOn: job.finishedOn ?? null,
							};
						})
					);
				},
				getJobDetail: async (id: string) => {
					const job = await bounded(() => queue.getJob(id), "getJob");
					if (!job) return null;
					const state = await bounded(() => job.getState(), "getJobState");
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
					const job = await bounded(() => queue.getJob(id), "getJob");
					if (!job) return false;
					await bounded(() => job.retry(), "retry");
					return true;
				},
				removeJob: async (id: string): Promise<boolean> => {
					const job = await bounded(() => queue.getJob(id), "getJob");
					if (!job) return false;
					try {
						await bounded(() => job.remove(), "remove");
					} catch (error) {
						if (
							error instanceof Error &&
							error.message.includes("locked by another worker")
						)
							return false;
						throw error;
					}
					return true;
				},
				close: () => bounded(() => queue.close(), "close"),
			};
		},

		createWorker<T>(
			name: string,
			processor: CrawlerProcessor<T>,
			options: Omit<WorkerOptions, "connection"> & {
				onDeadline?: (job: CrawlerJob<T>) => Promise<void>;
			} = {}
		): CrawlerWorker {
			const { onDeadline, ...workerOptions } = options;
			let taskTimeoutMs = 120_000;
			const controller = new AbortController();
			workerControllers.push(controller);
			const worker = new Worker<T>(
				name,
				async (job, token) => {
					const crawlerJob: CrawlerJob<T> = {
						id: job.id ?? undefined,
						data: job.data,
						enqueuedAt: queueReadyAt(job.data) ?? job.timestamp,
						startedAt: job.processedOn ?? Date.now(),
						delayMs: queueReadyAt(job.data) === undefined ? (job.opts.delay ?? 0) : 0,
						attemptsMade: job.attemptsMade,
						updateData: async (data) => {
							assertTaskActive();
							await bounded(() => job.updateData(data), "updateData");
							crawlerJob.data = data;
						},
						updateProgress: (progress) => {
							assertTaskActive();
							return bounded(() => job.updateProgress(progress), "updateProgress");
						},
					};
					const rawData = job.data as Record<string, unknown> | null;
					const carrier =
						rawData && typeof rawData === "object" && "_traceCarrier" in rawData
							? (rawData._traceCarrier as Record<string, string>)
							: undefined;
					const parentContext = carrier
						? propagation.extract(context.active(), carrier)
						: context.active();

					await context.with(parentContext, async () => {
						const effectiveTimeout =
							rawData &&
							typeof rawData === "object" &&
							"_timeoutMs" in rawData &&
							typeof rawData._timeoutMs === "number" &&
							rawData._timeoutMs > 0
								? rawData._timeoutMs
								: taskTimeoutMs;
						try {
							await withLogContext(
								{
									queue: name,
									jobId: job.id,
									jobName: job.name,
								},
								() =>
									runTaskWithDeadline(
										effectiveTimeout,
										async () => {
											try {
												await processor(crawlerJob);
											} catch (error) {
												if (!(error instanceof RetryLaterError))
													throw error;
												const readyAt =
													Date.now() + Math.max(1, error.delayMs);
												if (
													typeof job.data === "object" &&
													job.data !== null
												)
													await bounded(
														() =>
															job.updateData({
																...job.data,
																_queueReadyAt: readyAt,
															}),
														"updateData"
													);
												await bounded(() =>
													job.moveToDelayed(readyAt, token)
												);
												throw new DelayedError();
											}
										},
										controller.signal
									)
							);
						} catch (error) {
							if (!(error instanceof TaskDeadlineError) || !onDeadline) throw error;
							await onDeadline(crawlerJob);
							const readyAt = Date.now() + 1000;
							if (typeof job.data === "object" && job.data !== null)
								await bounded(
									() => job.updateData({ ...job.data, _queueReadyAt: readyAt }),
									"updateData"
								);
							await bounded(() => job.moveToDelayed(readyAt, token));
							throw new DelayedError();
						}
					});
				},
				{ drainDelay: 0.1, ...workerOptions, connection, prefix }
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
					return bounded(() => worker.close(force), "closeWorker");
				},
			};
		},

		async close(): Promise<void> {
			for (const controller of workerControllers)
				controller.abort(new Error("Crawler MQ stopped"));
			connection.disconnect();
			await Promise.allSettled(
				queues.map((queue) => bounded(() => queue.waitUntilReady(), "waitUntilReady"))
			);
			await Promise.allSettled(
				workers.map((worker) => bounded(() => worker.close(true), "closeWorker"))
			);
			await drainActiveTasks(operationTimeoutMs);
			await Promise.allSettled(queues.map((queue) => bounded(() => queue.close(), "close")));
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
