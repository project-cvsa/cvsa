import type { JsonValue, Outbox, OutboxStatus, TxClient } from "@cvsa/db";

export interface RecordOutboxEventParams {
	aggregateType: string;
	aggregateId: number;
	eventType: string;
	payload?: JsonValue;
}

/** Append one catalog domain event to the transactional outbox. */
export async function recordOutboxEvent(
	tx: TxClient,
	params: RecordOutboxEventParams
): Promise<Outbox> {
	const status: OutboxStatus = "PENDING";
	return tx.orm.meta.Outbox.create({
		aggregateType: params.aggregateType,
		aggregateId: params.aggregateId,
		eventType: params.eventType,
		payload: params.payload ?? undefined,
		status,
	});
}
