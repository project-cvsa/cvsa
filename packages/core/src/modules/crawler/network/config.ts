import { AppError } from "../../../error";
import { appLogger } from "@cvsa/logger";
import type { AdapterRegistry } from "./adapter";
import type {
	NetworkDelegate,
	NetworkRateLimiter,
	NetworkRequest,
	NetworkResponse,
} from "./contracts";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeConfigSchema,
	type NetworkRuntimeConfigDocument,
	type NetworkRuntimeStatus,
} from "./dto";
import { NetworkScheduler } from "./scheduler";
import type { INetworkRuntimeConfigRepository } from "./repository.interface";

export class NetworkRuntimeConfigManager implements NetworkDelegate {
	private scheduler: NetworkScheduler | undefined;
	private revision: number | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly repository: INetworkRuntimeConfigRepository,
		private readonly registry: AdapterRegistry,
		private readonly rateLimiter: NetworkRateLimiter
	) {}

	async execute(request: NetworkRequest): Promise<NetworkResponse> {
		if (!this.scheduler)
			throw new AppError(
				"Network runtime configuration is not available",
				"NO_AVAILABLE_ADAPTER",
				503
			);
		return this.scheduler.execute(request);
	}

	async load(): Promise<boolean> {
		try {
			const persisted = await this.repository.get();
			if (!persisted) return false;
			return this.apply(NetworkRuntimeConfigDocumentSchema.parse(persisted));
		} catch (error) {
			appLogger.error("Network runtime configuration rejected; keeping previous revision", {
				component: "network-config",
				revision: this.revision,
				error,
			});
			return false;
		}
	}

	apply(document: NetworkRuntimeConfigDocument): boolean {
		try {
			const validatedDocument = NetworkRuntimeConfigDocumentSchema.parse(document);
			if (this.revision !== undefined && validatedDocument.revision <= this.revision)
				return false;
			const config = NetworkRuntimeConfigSchema.parse(validatedDocument.config);
			const adapters = new Map(
				config.adapters.map((adapter) => [adapter.id, this.registry.create(adapter)])
			);
			const nextScheduler = new NetworkScheduler(
				config,
				adapters,
				this.rateLimiter
			);
			this.scheduler = nextScheduler;
			this.revision = validatedDocument.revision;
			appLogger.info("Network runtime configuration loaded", {
				component: "network-config",
				revision: this.revision,
			});
			return true;
		} catch (error) {
			appLogger.error("Network runtime configuration rejected; keeping previous revision", {
				component: "network-config",
				revision: this.revision,
				error,
			});
			return false;
		}
	}

	getStatus(): NetworkRuntimeStatus {
		return { ready: this.scheduler !== undefined, revision: this.revision ?? null };
	}

	startPolling(intervalMs = 5_000): void {
		if (this.pollTimer) return;
		this.pollTimer = setInterval(() => {
			void this.load();
		}, intervalMs);
	}

	stopPolling(): void {
		if (!this.pollTimer) return;
		clearInterval(this.pollTimer);
		this.pollTimer = undefined;
	}

	async close(): Promise<void> {
		this.stopPolling();
		await this.rateLimiter.close?.();
	}
}
