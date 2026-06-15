import type { Queue } from "bullmq";
import type { IOutboxRepository } from "./repository.interface";
import type { CreateOutboxEntryDto, OutboxEntryDto, PendingOutboxQueryDto } from "./dto";
import { Prisma, type TxClient } from "@cvsa/db";
import { outboxQueue } from "../../outbox/queue";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";

const MAX_RETRIES = 5;

export class OutboxService {
	private readonly queue: Queue<OutboxEntryDto>;

	constructor(
		private readonly repository: IOutboxRepository,
		queue?: Queue<OutboxEntryDto>
	) {
		this.queue = queue ?? outboxQueue;
	}

	async createEntry(input: CreateOutboxEntryDto, tx: TxClient): Promise<OutboxEntryDto> {
		return traceTask("outbox.createEntry", () => this.repository.create(input, tx));
	}

	async enqueue(entry: OutboxEntryDto): Promise<void> {
		await traceTask("outbox.enqueue", async () => {
			await this.queue.add(`outbox-${entry.aggregateType}-${entry.aggregateId}`, entry, {
				jobId: `outbox-${entry.id}`,
				attempts: MAX_RETRIES,
				backoff: { type: "exponential", delay: 1000 },
			});
		});
	}

	async processEntry(
		id: number,
		processor: (aggregateType: string, aggregateId: number, eventType: string) => Promise<void>
	): Promise<void> {
		try {
			const entry = await this.repository.markProcessing(id);
			try {
				await processor(entry.aggregateType, entry.aggregateId, entry.eventType);
				await this.repository.markProcessed(id);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				appLogger.warn(`Outbox entry ${id} processing failed: ${errorMessage}`);
				if (entry.retryCount >= MAX_RETRIES - 1) {
					await this.repository.markFailed(
						id,
						errorMessage,
						new Date(Date.now() + 3600_000)
					);
				} else {
					throw error;
				}
			}
		} catch (error) {
			// Handle case where outbox entry no longer exists (already processed or cleaned up)
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
				appLogger.debug(`Outbox entry ${id} not found, skipping processing`);
				return;
			}
			throw error;
		}
	}

	async recoverStaleEntries(limit: number = 100): Promise<void> {
		const query: PendingOutboxQueryDto = { limit };
		const entries = await this.repository.findPending(query);
		for (const entry of entries) {
			await this.queue.add(`outbox-recover-${entry.id}`, entry, {
				jobId: `outbox-recover-${entry.id}`,
				attempts: MAX_RETRIES,
				backoff: { type: "exponential", delay: 1000 },
			});
		}
	}
}
