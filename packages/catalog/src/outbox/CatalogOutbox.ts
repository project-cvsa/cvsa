import type { JsonValue, Outbox, OutboxStatus, TxClient } from "@cvsa/db";

export interface RecordOutboxEventParams {
	aggregateType: string;
	aggregateId: number;
	eventType: string;
	payload?: JsonValue;
}

export class CatalogOutbox {
	static async recordEvent(tx: TxClient, params: RecordOutboxEventParams): Promise<Outbox> {
		const status: OutboxStatus = "PENDING";
		return tx.orm.meta.Outbox.create({
			aggregateType: params.aggregateType,
			aggregateId: params.aggregateId,
			eventType: params.eventType,
			payload: params.payload ?? undefined,
			status,
		});
	}
}
