import {
	type PrismaClient,
	type TxClient,
	Temporal,
	toInstant,
	transformPrismaResult,
	or,
} from "@cvsa/db";
import type { CreateOutboxEntryDto, OutboxEntryDto, PendingOutboxQueryDto } from "./dto";
import type { IOutboxRepository } from "./repository.interface";
import { OutboxNotFoundError } from "./service";

export class OutboxRepository implements IOutboxRepository {
	constructor(private readonly prisma: PrismaClient) {}

	async create(input: CreateOutboxEntryDto, tx?: TxClient): Promise<OutboxEntryDto> {
		const client = tx ?? this.prisma;
		const row = await client.orm.meta.Outbox.create({
			aggregateType: input.aggregateType,
			aggregateId: input.aggregateId,
			eventType: input.eventType,
			payload: (input.payload ?? null) as unknown as undefined,
			status: "PENDING",
		});
		return transformPrismaResult(row);
	}

	async findPending(query: PendingOutboxQueryDto): Promise<OutboxEntryDto[]> {
		const client = this.prisma;
		const now = Temporal.Now.instant();
		const rows = await client.orm.meta.Outbox.where({ status: "PENDING" })
			.where((o) => or(o.nextRetryAt.isNull(), o.nextRetryAt.lte(now)))
			.orderBy((o) => o.createdAt.asc())
			.limit(query.limit)
			.all();
		return transformPrismaResult(rows);
	}

	async markProcessing(id: number, tx?: TxClient): Promise<OutboxEntryDto> {
		const client = tx ?? this.prisma;
		const row = await client.orm.meta.Outbox.where({ id }).update({ status: "PROCESSING" });
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return transformPrismaResult(row);
	}

	async markProcessed(id: number, tx?: TxClient): Promise<OutboxEntryDto> {
		const client = tx ?? this.prisma;
		const row = await client.orm.meta.Outbox.where({ id }).update({
			status: "PROCESSED",
			processedAt: Temporal.Now.instant(),
		});
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return transformPrismaResult(row);
	}

	async markFailed(
		id: number,
		lastError: string,
		nextRetryAt: Date,
		tx?: TxClient
	): Promise<OutboxEntryDto> {
		const client = tx ?? this.prisma;
		const existing = await client.orm.meta.Outbox.first({ id });
		if (!existing) {
			throw new OutboxNotFoundError(id);
		}
		const row = await client.orm.meta.Outbox.where({ id }).update({
			status: "FAILED",
			lastError,
			nextRetryAt: toInstant(nextRetryAt),
			retryCount: (existing.retryCount ?? 0) + 1,
		});
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return transformPrismaResult(row);
	}
}
