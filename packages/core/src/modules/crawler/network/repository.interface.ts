import type { NetworkRuntimeConfig, NetworkRuntimeConfigRecordDto } from "@cvsa/network-scheduler";

export abstract class INetworkRuntimeConfigRepository {
	abstract get(): Promise<NetworkRuntimeConfigRecordDto | null>;
	abstract create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null>;
	abstract replace(
		expectedRevision: number,
		config: NetworkRuntimeConfig
	): Promise<NetworkRuntimeConfigRecordDto | null>;
}
