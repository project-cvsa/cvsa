import type { NetworkRuntimeConfig } from "@cvsa/network-scheduler";

/**
 * A persisted configuration row.
 *
 * `config` stays `unknown` on purpose: the stored JSON is untrusted until
 * `NetworkRuntimeConfigSchema` parses it, and a document that no longer parses
 * must not be able to block an operator from replacing it.
 */
export interface NetworkRuntimeConfigRecordDto {
	revision: number;
	config: unknown;
	updatedAt: Date | string;
}

export abstract class INetworkRuntimeConfigRepository {
	abstract get(): Promise<NetworkRuntimeConfigRecordDto | null>;
	abstract create(config: NetworkRuntimeConfig): Promise<NetworkRuntimeConfigRecordDto | null>;
	abstract replace(
		expectedRevision: number,
		config: NetworkRuntimeConfig
	): Promise<NetworkRuntimeConfigRecordDto | null>;
}
