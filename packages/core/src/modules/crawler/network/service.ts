import { AppError } from "../../../error";
import { appLogger } from "@cvsa/logger";
import {
	NetworkRuntimeConfigSchema,
	type NetworkAdapterConfig,
	type NetworkRuntimeConfig,
} from "@cvsa/network-scheduler";
import { NetworkRuntimeConfigDocumentSchema, type NetworkRuntimeConfigDocument } from "../dto";
import { hasRedactedProxyCredentials, restoreProxyCredentials } from "./redaction";
import type {
	INetworkRuntimeConfigRepository,
	NetworkRuntimeConfigRecordDto,
} from "./repository.interface";

type HttpProxyAdapterConfig = Extract<NetworkAdapterConfig, { type: "http-proxy" }>;

function isHttpProxyAdapter(adapter: NetworkAdapterConfig): adapter is HttpProxyAdapterConfig {
	return adapter.type === "http-proxy";
}

/**
 * Best-effort read of the stored configuration used as the credential source.
 * A record that no longer parses must not block a write — the operator needs to
 * be able to replace a broken document — so it degrades to "no stored credential
 * available", which the merge below reports explicitly for redacted adapters.
 */
function readStoredConfig(
	record: NetworkRuntimeConfigRecordDto | null
): NetworkRuntimeConfig | null {
	if (!record) return null;
	const parsed = NetworkRuntimeConfigSchema.safeParse(record.config);
	if (parsed.success) return parsed.data;
	appLogger.warn("Stored network runtime configuration could not be parsed", {
		component: "network-config",
		revision: record.revision,
	});
	return null;
}

/**
 * Re-inserts stored proxy credentials wherever a client submitted the redacted
 * placeholder. Without this, a read-modify-write cycle through the API — GET the
 * masked document, change a weight, PUT it back — would overwrite the real
 * credential with `***`.
 *
 * The submitted host, port, and path still win, so rotating an exit while
 * keeping its credential works. A placeholder with no stored credential to
 * restore from is rejected rather than persisted as a literal `***`.
 */
function restoreRedactedCredentials(
	incoming: NetworkRuntimeConfig,
	existing: NetworkRuntimeConfig | null
): NetworkRuntimeConfig {
	const adapters = incoming.adapters.map((adapter) => {
		if (!isHttpProxyAdapter(adapter)) return adapter;
		if (!hasRedactedProxyCredentials(adapter.proxyUrl)) return adapter;

		const persisted = existing?.adapters
			.filter(isHttpProxyAdapter)
			.find((candidate) => candidate.id === adapter.id);

		const restored = persisted && restoreProxyCredentials(adapter.proxyUrl, persisted.proxyUrl);

		if (restored === undefined) {
			throw new AppError(
				`Adapter "${adapter.id}" was submitted with a redacted proxy credential, but no stored credential is available to restore`,
				"VALIDATION_ERROR",
				422
			);
		}
		return { ...adapter, proxyUrl: restored };
	});

	return { ...incoming, adapters };
}

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
		const nextConfig = restoreRedactedCredentials(validatedConfig, readStoredConfig(existing));

		if (!existing) {
			if (expectedRevision !== 0) {
				throw new AppError(
					"Network runtime configuration revision conflicts",
					"ENTITY_CONFLICT",
					409
				);
			}
			const created = await this.repository.create(nextConfig);
			if (!created) {
				throw new AppError(
					"Network runtime configuration revision conflicts",
					"ENTITY_CONFLICT",
					409
				);
			}
			return NetworkRuntimeConfigDocumentSchema.parse(created);
		}
		const replaced = await this.repository.replace(expectedRevision, nextConfig);
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
