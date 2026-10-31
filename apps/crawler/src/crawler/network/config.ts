import {
	BILIBILI_REQUEST_TYPES,
	BilibiliEnvelopeSchema,
	BilibiliSessionConfigSchema,
	type BilibiliSessionConfig,
	type BilibiliSessionStatus,
} from "@cvsa/contracts";
import { normalizeBilibiliRuntimeConfig } from "./policy";
import { assertTaskActive, getTaskSignal } from "../shared/taskContext";
import { RetryLaterError } from "../shared/retryLater";
import { AppError } from "@cvsa/contracts";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import {
	CrawlerExecutionConfigSchema,
	type CrawlerExecutionConfig,
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
	private adapterIds: string[] = [];
	private bindings: NonNullable<NetworkRuntimeConfig["bindings"]> = [];
	private sessionConfig = BilibiliSessionConfigSchema.parse({});
	private readonly sessionListeners = new Set<(config: BilibiliSessionConfig) => void>();
	private sessionStatus: (() => BilibiliSessionStatus) | undefined;
	onSessionChange(listener: (config: BilibiliSessionConfig) => void): void {
		this.sessionListeners.add(listener);
		listener(this.sessionConfig);
	}
	setSessionStatus(provider: () => BilibiliSessionStatus): void {
		this.sessionStatus = provider;
	}
	private revision: number | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private readonly metrics: NetworkMetrics;
	private readonly logger: NetworkSchedulerLogger;
	private readonly tracer: NetworkSchedulerTracer;
	private readonly clock: (() => number) | undefined;
	private execution = CrawlerExecutionConfigSchema.parse({});
	private readonly executionListeners = new Set<(config: CrawlerExecutionConfig) => void>();

	getExecutionConfig(): CrawlerExecutionConfig {
		return { ...this.execution };
	}
	onExecutionChange(listener: (config: CrawlerExecutionConfig) => void): void {
		this.executionListeners.add(listener);
		listener(this.getExecutionConfig());
	}
	async remainingDelay(): Promise<number> {
		const requestType = "bilibili:tracking";
		const scope = "bilibili";
		const global = (await this.rateLimiter.remainingDelay?.(scope)) ?? 0;
		if (global > 0) return global;
		const ids =
			this.bindings.find((binding) => binding.requestType === requestType)?.adapterIds ??
			this.adapterIds;
		const delays = await Promise.all(
			ids
				.filter((id) => this.adapterIds.includes(id))
				.map((id) => this.rateLimiter.remainingDelay?.(`adapter:${id}:${scope}`) ?? 0)
		);
		return delays.length > 0 ? Math.min(...delays) : 0;
	}
	async getStatusWithCooldowns(): Promise<NetworkRuntimeStatus> {
		const types = ["bilibili", "bilibili-api", ...BILIBILI_REQUEST_TYPES];
		const scopes = types.flatMap((type) => [
			type,
			...this.adapterIds.map((id) => `adapter:${id}:${type}`),
		]);
		const cooldowns = await Promise.all(
			scopes.map(
				async (scope): Promise<NonNullable<NetworkRuntimeStatus["cooldowns"]>[number]> => {
					const remainingMs = (await this.rateLimiter.remainingDelay?.(scope)) ?? 0;
					return {
						scope,
						remainingMs,
						until: Date.now() + remainingMs,
						reason: "upstream_throttle",
					};
				}
			)
		);
		return {
			...this.getStatus(),
			adapters: (await this.scheduler?.getAdapterStatusesWithRates()) ?? [],
			cooldowns: cooldowns.filter((item) => item.remainingMs > 0),
			...(this.sessionStatus ? { session: this.sessionStatus() } : {}),
		};
	}

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
			assertTaskActive();
			const response = await this.scheduler.execute({
				...request,
				signal: request.signal ?? getTaskSignal(),
			});
			assertTaskActive();
			if (
				response.errorCode === "RATE_LIMITED" ||
				response.errorCode === "HTTP_429" ||
				response.errorCode === "APPLICATION_RATE_LIMIT" ||
				response.retryReason === "network_recovery"
			) {
				let value: unknown;
				try {
					value = JSON.parse(response.body);
				} catch {
					value = undefined;
				}
				const envelope = BilibiliEnvelopeSchema.safeParse(value);
				const code = envelope.success ? envelope.data.code : undefined;
				const message = envelope.success ? envelope.data.message : undefined;
				appLogger.warn("Network request deferred due to rate limit or throttle", {
					component: "network-config",
					url: request.url,
					requestType: request.requestType,
					errorCode: response.errorCode,
					biliCode: code,
					biliMessage: message,
					retryAfterMs: response.retryAfterMs ?? 1000,
					...request.context,
				});
				throw new RetryLaterError(
					response.retryAfterMs ?? 1000,
					response.retryReason ?? "upstream",
					code,
					message
				);
			}
			return response;
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
			const config = normalizeBilibiliRuntimeConfig(validatedDocument.config);
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
			this.adapterIds = config.adapters
				.filter((adapter) => adapter.enabled)
				.map((adapter) => adapter.id);
			this.bindings = config.bindings ?? [];
			this.sessionConfig = BilibiliSessionConfigSchema.parse(config.session ?? {});
			for (const listener of this.sessionListeners) listener(this.sessionConfig);
			this.execution = CrawlerExecutionConfigSchema.parse(config.execution ?? {});
			for (const listener of this.executionListeners) listener(this.getExecutionConfig());
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
