import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "@cvsa/env";
import { appLogger } from "@cvsa/logger";
import type { OutboxEntryDto } from "@cvsa/core/internal";

const QUEUE_NAME = "outbox";

let connection: IORedis | undefined;

function getConnection(): IORedis {
	if (!connection) {
		appLogger.debug(`Connecting to redis at ${env.REDIS_URL}`);
		connection = new IORedis(env.REDIS_URL, {
			maxRetriesPerRequest: null,
		});
	}
	return connection;
}

export const outboxQueue: Queue<OutboxEntryDto, unknown, string, OutboxEntryDto, unknown, string> =
	new Queue<OutboxEntryDto>(QUEUE_NAME, {
		connection: getConnection(),
		defaultJobOptions: {
			attempts: 5,
			backoff: {
				type: "exponential",
				delay: 1000,
			},
			removeOnComplete: true,
			removeOnFail: {
				age: 24 * 3600,
				count: 1000,
			},
		},
	});

export function createOutboxWorker(
	processor: (job: Job<OutboxEntryDto>) => Promise<void>
): Worker<OutboxEntryDto> {
	const worker = new Worker<OutboxEntryDto>(QUEUE_NAME, processor, {
		connection: getConnection(),
		concurrency: 5,
	});

	worker.on("completed", (job) => {
		appLogger.info(`Outbox job ${job.id} completed`);
	});

	worker.on("failed", (job, err) => {
		appLogger.error(`Outbox job ${job?.id} failed: ${err.message}`);
	});

	return worker;
}

export async function closeOutboxInfrastructure(): Promise<void> {
	await outboxQueue.close();
	if (connection) {
		await connection.quit();
		connection = undefined;
	}
}
