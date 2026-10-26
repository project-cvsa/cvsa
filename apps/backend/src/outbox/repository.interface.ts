import type { TxClient } from "@cvsa/db";
import type { CreateOutboxEntryDto, OutboxEntryDto, PendingOutboxQueryDto } from "./dto";

export abstract class IOutboxRepository {
	abstract create(input: CreateOutboxEntryDto, tx?: TxClient): Promise<OutboxEntryDto>;
	abstract findPending(query: PendingOutboxQueryDto): Promise<OutboxEntryDto[]>;
	abstract markProcessing(id: number, tx?: TxClient): Promise<OutboxEntryDto>;
	abstract markProcessed(id: number, tx?: TxClient): Promise<OutboxEntryDto>;
	abstract markFailed(
		id: number,
		lastError: string,
		nextRetryAt: Date,
		tx?: TxClient
	): Promise<OutboxEntryDto>;
}
