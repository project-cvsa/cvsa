import { Queue, Worker, type JobsOptions, type WorkerOptions } from "bullmq";
import IORedis from "ioredis";
import { crawlerEnv } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import type {
	CrawlerLogger,
	CrawlerJob,
	CrawlerMq,
	CrawlerProcessor,
	CrawlerQueue,
	CrawlerWorker,
} from "./types";

const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 3,
	backoff: { type: "exponential", delay: 1_000 },
	removeOnComplete: true,
	removeOnFail: { age: 24 * 60 * 60, count: 1_000 },
};

export function createCrawlerMq(
	redisUrl = crawlerEnv.CRAWLER_REDIS_URL,
	logger: CrawlerLogger = appLogger
): CrawlerMq {
	const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
	const queues: Array<Queue<unknown>> = [];
	const workers: Array<Worker<unknown>> = [];

	return {
		async connect(): Promise<void> {
			await connection.ping();
			logger.info("Crawler MQ connected", { component: "crawler-mq" });
		},

		createQueue<T>(name: string, options: JobsOptions = {}): CrawlerQueue<T> {
			const queue = new Queue<T, unknown, string, T, unknown, string>(name, {
				connection,
				defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...options },
			});
			queues.push(queue as Queue<unknown>);
			return {
				add: async (jobName: string, data: T, jobOptions?: JobsOptions): Promise<void> => {
					await queue.add(jobName, data, jobOptions);
				},
				close: () => queue.close(),
			};
		},

		createWorker<T>(
			name: string,
			processor: CrawlerProcessor<T>,
			options: Omit<WorkerOptions, "connection"> = {}
		): CrawlerWorker {
			const worker = new Worker<T>(
				name,
				async (job) => {
					const crawlerJob: CrawlerJob<T> = { id: job.id ?? undefined, data: job.data };
					await processor(crawlerJob);
				},
				{ ...options, connection }
			);
			workers.push(worker as Worker<unknown>);
			worker.on("failed", (job, error) => {
				logger.error("Crawler MQ job failed", {
					component: "crawler-mq",
					jobId: job?.id,
					error,
				});
			});
			return { close: () => worker.close() };
		},

		async close(): Promise<void> {
			await Promise.all(workers.map((worker) => worker.close()));
			await Promise.all(queues.map((queue) => queue.close()));
			await connection.quit();
			logger.info("Crawler MQ closed", { component: "crawler-mq" });
		},
	};
}
