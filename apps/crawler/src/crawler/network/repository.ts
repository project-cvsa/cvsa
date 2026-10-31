import { and, eq } from "drizzle-orm";
import type { DatabaseClient, JsonValue } from "@cvsa/snapshot-db";
import { networkRuntimeConfig } from "@cvsa/snapshot-db";
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
	updatedAt: { toString(): string };
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
		const [record] = await traceTask("snapshotDb.networkRuntimeConfig.get", () =>
			this.db
				.select()
				.from(networkRuntimeConfig)
				.where(eq(networkRuntimeConfig.id, CONFIG_ID))
				.limit(1)
		);
		return record ? toRecord(record) : null;
	}

	async create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null> {
		const [record] = await traceTask("snapshotDb.networkRuntimeConfig.create", () =>
			this.db
				.insert(networkRuntimeConfig)
				.values({
					id: CONFIG_ID,
					revision: 1,
					config: config as unknown as JsonValue,
				})
				.returning()
		);
		return record ? toRecord(record) : null;
	}

	async replace(
		expectedRevision: number,
		config: NetworkRuntimeConfig
	): Promise<NetworkRuntimeConfigRecordDto | null> {
		const [record] = await traceTask("snapshotDb.networkRuntimeConfig.replace", () =>
			this.db
				.update(networkRuntimeConfig)
				.set({
					revision: expectedRevision + 1,
					config: config as unknown as JsonValue,
				})
				.where(
					and(
						eq(networkRuntimeConfig.id, CONFIG_ID),
						// Compare-and-set: a stale revision must not clobber a newer
						// config written by another operator.
						eq(networkRuntimeConfig.revision, expectedRevision)
					)
				)
				.returning()
		);
		return record ? toRecord(record) : null;
	}
}
