import type { PrismaClient } from "@cvsa/db";
import { transformPrismaResult, type TxClient } from "@cvsa/db";
import type { CreateOutboxEntryDto, PendingOutboxQueryDto } from "./dto";
import type { IOutboxRepository } from "./repository.interface";

export class OutboxRepository implements IOutboxRepository {
	constructor(private readonly prisma: PrismaClient) {}

	async create(input: CreateOutboxEntryDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return transformPrismaResult(
			await client.outbox.create({
				data: {
					aggregateType: input.aggregateType,
					aggregateId: input.aggregateId,
					eventType: input.eventType,
					payload: input.payload ?? null,
				},
			})
		);
	}

	async findPending(query: PendingOutboxQueryDto) {
		const client = this.prisma;
		return transformPrismaResult(
			await client.outbox.findMany({
				where: {
					status: "PENDING",
					OR: [{ nextRetryAt: { lte: new Date() } }, { nextRetryAt: null }],
				},
				orderBy: { createdAt: "asc" },
				take: query.limit,
			})
		);
	}

	async markProcessing(id: number, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return transformPrismaResult(
			await client.outbox.update({
				where: { id },
				data: { status: "PROCESSING" },
			})
		);
	}

	async markProcessed(id: number, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return transformPrismaResult(
			await client.outbox.update({
				where: { id },
				data: { status: "PROCESSED", processedAt: new Date() },
			})
		);
	}

	async markFailed(id: number, lastError: string, nextRetryAt: Date, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return transformPrismaResult(
			await client.outbox.update({
				where: { id },
				data: {
					status: "FAILED",
					lastError,
					nextRetryAt,
					retryCount: { increment: 1 },
				},
			})
		);
	}
}
