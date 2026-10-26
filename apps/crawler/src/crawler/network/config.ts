import { AppError } from "@cvsa/contracts";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import {
	NetworkRuntimeConfigSchema,
	NetworkScheduler,
	NetworkSchedulerError,
	type AdapterRegistry,
	type NetworkDelegate,
	type NetworkMetrics,
	type NetworkRateLimiter,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRuntimeConfig,
	type NetworkSchedulerLogger,
	type NetworkSchedulerTracer,
} from "@cvsa/network-scheduler";
import {
	NetworkRuntimeConfigDocumentSchema,
	type NetworkRuntimeConfigDocument,
	type NetworkRuntimeStatus,
} from "../dto";
import type { INetworkRuntimeConfigRepository } from "./repository.interface";
import { createNetworkMetrics } from "./telemetry";

/** Bridges the scheduler's logger contract onto the application logger. */
export function createCrawlerNetworkLogger(): NetworkSchedulerLogger {
	return {
		info(message, attrs) {
			appLogger.info(message, attrs);
		},
		warn(message, attrs) {
			appLogger.warn(message, attrs);
		},
		error(message, attrs) {
			appLogger.error(message, attrs);
		},
		debug(message, attrs) {
			appLogger.debug(message, attrs);
		},
		trace(message, attrs) {
			appLogger.trace(message, attrs);
		},
	};
}

/** Bridges the scheduler's tracer contract onto the shared OpenTelemetry tracer. */
export function createCrawlerNetworkTracer(): NetworkSchedulerTracer {
	return {
		async traceTask<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
			const result = await traceTask(name, async () => await fn());
			return result;
		},
	};
}

export interface NetworkRuntimeConfigManagerOptions {
	metrics?: NetworkMetrics;
	logger?: NetworkSchedulerLogger;
	tracer?: NetworkSchedulerTracer;
	/** Injectable time source forwarded to the scheduler, used by tests. */
	clock?: () => number;
}

export function createDefaultDirectRuntimeConfig(): NetworkRuntimeConfig {
	return {
		adapters: [
			{
				id: "direct-default",
				type: "direct",
				enabled: true,
				baseWeight: 1,
				rateLimits: [
					{
						durationSeconds: 1,
						maxRequests: 5,
					},
				],
			},
		],
		bindings: [
			{
				requestType: "bilibili-api",
				adapterIds: ["direct-default"],
			},
		],
		requestTypePolicies: {},
	};
}

export class NetworkRuntimeConfigManager implements NetworkDelegate {
	private scheduler: NetworkScheduler | undefined;
	private revision: number | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private readonly metrics: NetworkMetrics;
	private readonly logger: NetworkSchedulerLogger;
	private readonly tracer: NetworkSchedulerTracer;
	private readonly clock: (() => number) | undefined;

	constructor(
		private readonly repository: INetworkRuntimeConfigRepository,
		private readonly registry: AdapterRegistry,
		private readonly rateLimiter: NetworkRateLimiter,
		options: NetworkRuntimeConfigManagerOptions = {}
	) {
		this.metrics = options.metrics ?? createNetworkMetrics();
		this.logger = options.logger ?? createCrawlerNetworkLogger();
		this.tracer = options.tracer ?? createCrawlerNetworkTracer();
		this.clock = options.clock;
	}

	async execute(request: NetworkRequest): Promise<NetworkResponse> {
		if (!this.scheduler)
			throw new AppError(
				"Network runtime configuration is not available",
				"NO_AVAILABLE_ADAPTER",
				503
			);
		try {
			return await this.scheduler.execute(request);
		} catch (error) {
			if (error instanceof NetworkSchedulerError) {
				throw new AppError(error.message, error.code, error.statusCode);
			}
			throw error;
		}
	}

	async load(): Promise<boolean> {
		try {
			const persisted = await this.repository.get();
			if (!persisted) {
				appLogger.warn(
					"No persisted network runtime config found; bootstrapping with default direct adapter",
					{ component: "network-config" }
				);
				return this.apply({
					revision: 0,
					config: createDefaultDirectRuntimeConfig(),
					updatedAt: new Date(),
				});
			}
			return this.apply(NetworkRuntimeConfigDocumentSchema.parse(persisted));
		} catch (error) {
			this.logRejection(error);
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
			if (this.scheduler) {
				this.scheduler.reload(config, adapters);
			} else {
				this.scheduler = new NetworkScheduler(config, adapters, this.rateLimiter, {
					metrics: this.metrics,
					logger: this.logger,
					tracer: this.tracer,
					...(this.clock ? { clock: this.clock } : {}),
				});
			}
			this.revision = validatedDocument.revision;
			appLogger.info("Network runtime configuration loaded", {
				component: "network-config",
				revision: this.revision,
				adapterIds: config.adapters.map((adapter) => adapter.id),
			});
			return true;
		} catch (error) {
			this.logRejection(error);
			return false;
		}
	}

	getStatus(): NetworkRuntimeStatus {
		return {
			ready: this.scheduler !== undefined,
			revision: this.revision ?? null,
			adapters: this.scheduler?.getAdapterStatuses() ?? [],
		};
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

	/**
	 * Logs the failure without echoing the rejected document. Proxy URLs may carry
	 * credentials, so only the validation summary and the retained revision are
	 * emitted.
	 */
	private logRejection(error: unknown): void {
		appLogger.error("Network runtime configuration rejected; keeping previous revision", {
			component: "network-config",
			revision: this.revision,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
}
