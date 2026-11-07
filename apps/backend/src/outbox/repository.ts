import {
	type DatabaseClient,
	type TxClient,
	Temporal,
	outbox,
	serializeResult,
	toInstant,
} from "@cvsa/db";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { CreateOutboxEntryDto, OutboxEntryDto, PendingOutboxQueryDto } from "./dto";
import type { IOutboxRepository } from "./repository.interface";
import { OutboxNotFoundError } from "./service";

export class OutboxRepository implements IOutboxRepository {
	constructor(private readonly db: DatabaseClient) {}

	async create(input: CreateOutboxEntryDto, tx?: TxClient): Promise<OutboxEntryDto> {
		const client = tx ?? this.db;
		const [row] = await client
			.insert(outbox)
			.values({
				aggregateType: input.aggregateType,
				aggregateId: input.aggregateId,
				eventType: input.eventType,
				payload: input.payload ?? null,
				status: "PENDING",
			})
			.returning();
		if (!row) throw new Error("Failed to append outbox entry");
		return serializeResult(row);
	}

	async findPending(query: PendingOutboxQueryDto): Promise<OutboxEntryDto[]> {
		const now = Temporal.Now.instant();
		const rows = await this.db
			.select()
			.from(outbox)
			.where(
				or(
					and(
						eq(outbox.status, "PENDING"),
						or(isNull(outbox.nextRetryAt), lte(outbox.nextRetryAt, now))
					),
					and(eq(outbox.status, "FAILED"), lte(outbox.nextRetryAt, now)),
					and(eq(outbox.status, "PROCESSING"), lte(outbox.nextRetryAt, now))
				)
			)
			.orderBy(asc(outbox.createdAt))
			.limit(query.limit);
		return serializeResult(rows);
	}

	async markProcessing(id: number, tx?: TxClient): Promise<OutboxEntryDto> {
		const client = tx ?? this.db;
		const leaseUntil = Temporal.Now.instant().add({ minutes: 5 });
		const [row] = await client
			.update(outbox)
			.set({
				status: "PROCESSING",
				nextRetryAt: leaseUntil,
			})
			.where(eq(outbox.id, id))
			.returning();
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return serializeResult(row);
	}

	async markProcessed(id: number, tx?: TxClient): Promise<OutboxEntryDto> {
		const client = tx ?? this.db;
		const [row] = await client
			.update(outbox)
			.set({
				status: "PROCESSED",
				processedAt: Temporal.Now.instant(),
			})
			.where(eq(outbox.id, id))
			.returning();
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return serializeResult(row);
	}

	async recordFailure(
		id: number,
		lastError: string,
		retryCount: number,
		nextRetryAt?: Date,
		tx?: TxClient
	): Promise<OutboxEntryDto> {
		const client = tx ?? this.db;
		const [row] = await client
			.update(outbox)
			.set({
				status: "PENDING",
				lastError,
				retryCount,
				...(nextRetryAt ? { nextRetryAt: toInstant(nextRetryAt) } : {}),
			})
			.where(eq(outbox.id, id))
			.returning();
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return serializeResult(row);
	}

	async markFailed(
		id: number,
		lastError: string,
		nextRetryAt: Date,
		tx?: TxClient
	): Promise<OutboxEntryDto> {
		const client = tx ?? this.db;
		const [existing] = await client.select().from(outbox).where(eq(outbox.id, id)).limit(1);
		if (!existing) {
			throw new OutboxNotFoundError(id);
		}
		const [row] = await client
			.update(outbox)
			.set({
				status: "FAILED",
				lastError,
				nextRetryAt: toInstant(nextRetryAt),
				retryCount: (existing.retryCount ?? 0) + 1,
			})
			.where(eq(outbox.id, id))
			.returning();
		if (!row) {
			throw new OutboxNotFoundError(id);
		}
		return serializeResult(row);
	}
}
