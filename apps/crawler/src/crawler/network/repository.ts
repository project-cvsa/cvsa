import type { PrismaClient } from "@cvsa/snapshot-db";
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
	updatedAt: Date | string;
}): NetworkRuntimeConfigRecordDto {
	return {
		revision: record.revision,
		config: record.config,
		updatedAt: record.updatedAt,
	};
}

export class NetworkRuntimeConfigRepository implements INetworkRuntimeConfigRepository {
	constructor(private readonly prisma: PrismaClient) {}

	async get(): Promise<NetworkRuntimeConfigRecordDto | null> {
		const record = await traceTask("snapshotDb.networkRuntimeConfig.get", () =>
			this.prisma.networkRuntimeConfig.findUnique({ where: { id: CONFIG_ID } })
		);
		return record ? toRecord(record) : null;
	}

	async create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null> {
		const records = await traceTask("snapshotDb.networkRuntimeConfig.create", () =>
			this.prisma.networkRuntimeConfig.createManyAndReturn({
				data: [
					{
						id: CONFIG_ID,
						revision: 0,
						config: config as unknown as object,
					},
				],
			})
		);
		return records[0] ? toRecord(records[0]) : null;
	}

	async replace(
		expectedRevision: number,
		config: NetworkRuntimeConfig
	): Promise<NetworkRuntimeConfigRecordDto | null> {
		const records = await traceTask("snapshotDb.networkRuntimeConfig.replace", () =>
			this.prisma.networkRuntimeConfig.updateManyAndReturn({
				where: {
					id: CONFIG_ID,
					revision: expectedRevision,
				},
				data: {
					revision: { increment: 1 },
					config: config as unknown as object,
				},
			})
		);
		return records[0] ? toRecord(records[0]) : null;
	}
}
