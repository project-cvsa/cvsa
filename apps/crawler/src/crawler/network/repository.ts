import type { DatabaseClient, JsonValue } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type { NetworkRuntimeConfig } from "@cvsa/network-scheduler";
import type {
	INetworkRuntimeConfigRepository,
	NetworkRuntimeConfigRecordDto,
} from "./repository.interface";

const CONFIG_ID = "default";

function toRecord(record: {
	revision: number;
	config: unknown;
	updatedAt: Date | string | { toString(): string };
}): NetworkRuntimeConfigRecordDto {
	return {
		revision: record.revision,
		config: record.config,
		updatedAt: record.updatedAt.toString(),
	};
}

export class NetworkRuntimeConfigRepository implements INetworkRuntimeConfigRepository {
	constructor(private readonly db: DatabaseClient) {}

	async get(): Promise<NetworkRuntimeConfigRecordDto | null> {
		const record = await traceTask("snapshotDb.networkRuntimeConfig.get", () =>
			this.db.orm.public.NetworkRuntimeConfig.where({ id: CONFIG_ID }).first()
		);
		return record ? toRecord(record) : null;
	}

	async create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null> {
		const record = await traceTask("snapshotDb.networkRuntimeConfig.create", () =>
			this.db.orm.public.NetworkRuntimeConfig.create({
				id: CONFIG_ID,
				revision: 0,
				config: config as unknown as JsonValue,
			})
		);
		return record ? toRecord(record) : null;
	}

	async replace(
		expectedRevision: number,
		config: NetworkRuntimeConfig
	): Promise<NetworkRuntimeConfigRecordDto | null> {
		const record = await traceTask("snapshotDb.networkRuntimeConfig.replace", () =>
			this.db.orm.public.NetworkRuntimeConfig.where({
				id: CONFIG_ID,
				revision: expectedRevision,
			}).update({
				revision: expectedRevision + 1,
				config: config as unknown as JsonValue,
			})
		);
		return record ? toRecord(record) : null;
	}
}
