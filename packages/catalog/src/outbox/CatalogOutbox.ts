import { type JsonValue, type Outbox, type OutboxStatus, type TxClient, outbox } from "@cvsa/db";

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
	const [row] = await tx
		.insert(outbox)
		.values({
			aggregateType: params.aggregateType,
			aggregateId: params.aggregateId,
			eventType: params.eventType,
			payload: params.payload ?? null,
			status,
		})
		.returning();
	if (!row) throw new Error("Failed to append outbox event");
	return row;
}
