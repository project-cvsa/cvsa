import { and, eq } from "drizzle-orm";
import type { DatabaseClient, JsonValue } from "@cvsa/snapshot-db";
import { networkRuntimeConfig } from "@cvsa/snapshot-db";
import { createDatabaseTracer } from "../stats/databaseMetrics";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
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
	private readonly trace;

	constructor(
		private readonly db: DatabaseClient,
		stats: StatsRecorder = createNoopStatsRecorder()
	) {
		this.trace = createDatabaseTracer(stats, "networkConfig");
	}

	async get(): Promise<NetworkRuntimeConfigRecordDto | null> {
		const [record] = await this.trace("networkRuntimeConfig.get", () =>
			this.db
				.select()
				.from(networkRuntimeConfig)
				.where(eq(networkRuntimeConfig.id, CONFIG_ID))
				.limit(1)
		);
		return record ? toRecord(record) : null;
	}

	async create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null> {
		const [record] = await this.trace("networkRuntimeConfig.create", () =>
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
		const [record] = await this.trace("networkRuntimeConfig.replace", () =>
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
