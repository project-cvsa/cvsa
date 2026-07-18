import { AppError } from "../../../error";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeConfigSchema,
	type NetworkRuntimeConfigDocument,
} from "@cvsa/network-scheduler";
import type { INetworkRuntimeConfigRepository } from "./repository.interface";

export class NetworkRuntimeConfigService {
	constructor(private readonly repository: INetworkRuntimeConfigRepository) {}

	async get(): Promise<NetworkRuntimeConfigDocument | null> {
		const persisted = await this.repository.get();
		if (!persisted) return null;
		return NetworkRuntimeConfigDocumentSchema.parse(persisted);
	}

	async replace(
		expectedRevision: number,
		config: unknown
	): Promise<NetworkRuntimeConfigDocument> {
		const validatedConfig = NetworkRuntimeConfigSchema.parse(config);
		const existing = await this.repository.get();
		if (!existing) {
			if (expectedRevision !== 0) {
				throw new AppError(
					"Network runtime configuration revision conflicts",
					"ENTITY_CONFLICT",
					409
				);
			}
			const created = await this.repository.create(validatedConfig);
			if (!created) {
				throw new AppError(
					"Network runtime configuration revision conflicts",
					"ENTITY_CONFLICT",
					409
				);
			}
			return NetworkRuntimeConfigDocumentSchema.parse(created);
		}
		const replaced = await this.repository.replace(expectedRevision, validatedConfig);
		if (!replaced) {
			throw new AppError(
				"Network runtime configuration revision conflicts",
				"ENTITY_CONFLICT",
				409
			);
		}
		return NetworkRuntimeConfigDocumentSchema.parse(replaced);
	}
}
