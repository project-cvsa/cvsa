import type { PrismaClient } from "@cvsa/snapshot-db";
import { BaseRepository } from "../../../utils/BaseRepository";
import type { NetworkRuntimeConfig, NetworkRuntimeConfigRecordDto } from "@cvsa/network-scheduler";
import type { INetworkRuntimeConfigRepository } from "./repository.interface";

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

export class NetworkRuntimeConfigRepository
	extends BaseRepository
	implements INetworkRuntimeConfigRepository
{
	constructor(private readonly prisma: PrismaClient) {
		super();
	}

	async get(): Promise<NetworkRuntimeConfigRecordDto | null> {
		const record = await this.query("snapshotDb.networkRuntimeConfig.get", () =>
			this.prisma.networkRuntimeConfig.findUnique({ where: { id: CONFIG_ID } })
		);
		return record ? toRecord(record) : null;
	}

	async create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null> {
		const records = await this.query("snapshotDb.networkRuntimeConfig.create", () =>
			this.prisma.networkRuntimeConfig.createManyAndReturn({
				data: { id: CONFIG_ID, config },
				skipDuplicates: true,
			})
		);
		const record = records[0];
		return record ? toRecord(record) : null;
	}

	async replace(
		expectedRevision: number,
		config: NetworkRuntimeConfig
	): Promise<NetworkRuntimeConfigRecordDto | null> {
		const records = await this.query("snapshotDb.networkRuntimeConfig.replace", () =>
			this.prisma.networkRuntimeConfig.updateManyAndReturn({
				where: { id: CONFIG_ID, revision: expectedRevision },
				data: { revision: { increment: 1 }, config },
			})
		);
		const record = records[0];
		return record ? toRecord(record) : null;
	}
}
