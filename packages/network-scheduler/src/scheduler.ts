import { NetworkSchedulerError } from "./errors";
import { createNoopNetworkSchedulerLogger, type NetworkSchedulerLogger } from "./logger";
import { createNoopNetworkSchedulerTracer, type NetworkSchedulerTracer } from "./tracer";
import {
	createNoopNetworkMetrics,
	type NetworkAttemptObserver,
	type NetworkMetrics,
} from "./telemetry";
import type { NetworkAdapterConfig, NetworkRuntimeConfig } from "./dto";
import {
	RETRYABLE_NETWORK_ERROR_CODES,
	type NetworkAdapter,
	type NetworkAdapterRuntimeStatus,
	type NetworkDelegate,
	type NetworkRateLimiter,
	type NetworkRequest,
	type NetworkResponse,
} from "./contracts";

interface AdapterStatistics {
	requests: number;
	failures: number;
	rateLimited: number;
	durationMs: number;
	durationSamples: number;
}

interface Candidate {
	adapter: NetworkAdapter;
	config: NetworkAdapterConfig;
}

export interface NetworkSchedulerOptions {
	random?: () => number;
	metrics?: NetworkMetrics;
	logger?: NetworkSchedulerLogger;
	tracer?: NetworkSchedulerTracer;
	clock?: () => number;
}

export class NetworkScheduler implements NetworkDelegate {
	private readonly random: () => number;
	private readonly metrics: NetworkMetrics;
	private readonly logger: NetworkSchedulerLogger;
	private readonly tracer: NetworkSchedulerTracer;
	private readonly clock: () => number;
	private config: NetworkRuntimeConfig;
	private adapters: ReadonlyMap<string, NetworkAdapter>;
	private readonly statistics = new Map<string, AdapterStatistics>();

	constructor(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>,
		private readonly rateLimiter: NetworkRateLimiter,
		options: NetworkSchedulerOptions = {}
	) {
		this.random = options.random ?? Math.random;
		this.metrics = options.metrics ?? createNoopNetworkMetrics();
		this.logger = options.logger ?? createNoopNetworkSchedulerLogger();
		this.tracer = options.tracer ?? createNoopNetworkSchedulerTracer();
		this.clock = options.clock ?? Date.now;
		this.config = structuredClone(config);
		this.adapters = new Map(adapters);
		this.syncStatistics(config);
	}

	public reload(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>
	): void {
		this.config = structuredClone(config);
		this.adapters = new Map(adapters);
		this.syncStatistics(config);
	}

	private syncStatistics(config: NetworkRuntimeConfig): void {
		const ids = new Set(config.adapters.map((adapter) => adapter.id));
		for (const id of this.statistics.keys()) {
			if (!ids.has(id)) this.statistics.delete(id);
		}
		for (const id of ids) {
			if (!this.statistics.has(id)) {
				this.statistics.set(id, {
					requests: 0,
					failures: 0,
					rateLimited: 0,
					durationMs: 0,
					durationSamples: 0,
				});
			}
		}
	}

	public getAdapterStatuses(): NetworkAdapterRuntimeStatus[] {
		return this.config.adapters.map((config) => {
			const stats = this.statistics.get(config.id);
			const rate = config.requestsPerSecond ?? 20;
			return {
				id: config.id,
				enabled: config.enabled,
				configuredRate: rate,
				requests: stats?.requests ?? 0,
				failures: stats?.failures ?? 0,
				rateLimited: stats?.rateLimited ?? 0,
				averageDurationMs: stats?.durationSamples
					? Math.round(stats.durationMs / stats.durationSamples)
					: null,
			};
		});
	}

	public async getAdapterStatusesWithRates(): Promise<NetworkAdapterRuntimeStatus[]> {
		return this.getAdapterStatuses();
	}

	public async execute(request: NetworkRequest): Promise<NetworkResponse> {
		return this.tracer.traceTask("crawler.network.delegate", async () => {
			request.signal?.throwIfAborted();
			return this.executeScheduled(request);
		});
	}

	private async executeScheduled(request: NetworkRequest): Promise<NetworkResponse> {
		const requestType = request.requestType;
		const binding = requestType
			? this.config.bindings?.find((item) => item.requestType === requestType)
			: undefined;

		if (requestType && !binding) {
			throw new NetworkSchedulerError(
				`No adapter binding for request type: ${requestType}`,
				"NO_AVAILABLE_ADAPTER",
				503
			);
		}

		const boundIds = binding
			? binding.adapterIds
			: this.config.adapters.map((adapter) => adapter.id);
		const adapterIds = request.adapterId
			? boundIds.filter((id) => id === request.adapterId)
			: boundIds;

		const candidates = adapterIds
			.map((id) => this.getCandidate(id))
			.filter((c): c is Candidate => c !== undefined);

		if (candidates.length === 0) {
			throw new NetworkSchedulerError(
				"No available network adapter for request type",
				"NO_AVAILABLE_ADAPTER",
				503
			);
		}

		let attempts = 0;
		let lastResponse: NetworkResponse | undefined;
		let budgetRefused = false;
		let minDelay = 1000;

		while (candidates.length > 0) {
			request.signal?.throwIfAborted();
			const candidate = this.takeWeightedCandidate(candidates);
			const rate = candidate.config.requestsPerSecond ?? 20;

			const allowed = await this.rateLimiter.consume(
				`adapter:${candidate.config.id}`,
				1,
				rate
			);
			if (!allowed) {
				const stats = this.statistics.get(candidate.config.id);
				if (stats) stats.rateLimited += 1;
				budgetRefused = true;
				minDelay = Math.min(minDelay, Math.ceil(1000 / rate));
				continue;
			}

			attempts += 1;
			const observer =
				this.metrics.createAttemptObserver?.({
					request,
					adapterId: candidate.config.id,
					adapterType: candidate.config.type,
				}) ?? this.createDefaultAttemptObserver();

			let response: NetworkResponse;
			try {
				response = await candidate.adapter.execute(request, observer);
			} catch (error) {
				if (request.signal?.aborted) throw error;
				response = {
					adapterId: candidate.config.id,
					status: 0,
					headers: {},
					body: "",
					durationMs: 0,
					errorCode: "NETWORK_FAILURE",
				};
			}

			if (request.signal?.aborted) {
				request.signal.throwIfAborted();
			}

			const stats = this.statistics.get(candidate.config.id);
			if (stats) {
				stats.requests += 1;
				stats.durationMs += response.durationMs;
				stats.durationSamples += 1;
				if (response.errorCode) stats.failures += 1;
			}

			const isSuccess =
				response.errorCode === undefined && response.status >= 200 && response.status < 300;
			if (isSuccess) {
				this.logger.debug?.("Network request completed", {
					component: "network-scheduler",
					adapterId: candidate.adapter.id,
					requestType: request.requestType ?? "default",
					url: request.url,
					status: response.status,
					durationMs: Math.round(response.durationMs),
					attempts,
					...request.context,
				});
				return response;
			}

			this.logger.warn("Network request returned error or non-2xx status", {
				component: "network-scheduler",
				adapterId: candidate.adapter.id,
				requestType: request.requestType ?? "default",
				url: request.url,
				status: response.status,
				durationMs: Math.round(response.durationMs),
				errorCode: response.errorCode,
				attempts,
				...request.context,
			});

			lastResponse = response;

			// If transport error and retryable, try next available candidate in pool
			if (
				response.errorCode &&
				RETRYABLE_NETWORK_ERROR_CODES.has(response.errorCode) &&
				candidates.length > 0
			) {
				continue;
			}

			return response;
		}

		if (lastResponse) return lastResponse;

		if (budgetRefused) {
			return {
				adapterId: "",
				status: 429,
				headers: {},
				body: "",
				durationMs: 0,
				errorCode: "RATE_LIMITED",
				retryAfterMs: minDelay,
				retryReason: "local_capacity",
			};
		}

		return {
			adapterId: "",
			status: 503,
			headers: {},
			body: "",
			durationMs: 0,
			errorCode: "NO_AVAILABLE_ADAPTER",
		};
	}

	private createDefaultAttemptObserver(): NetworkAttemptObserver {
		let started = false;
		let completed = false;
		return {
			started: () => {
				if (started) return;
				started = true;
				this.metrics.requests.add(1, {});
				if (this.metrics.requestsInFlight) {
					this.metrics.requestsInFlight.add(1, {});
				}
			},
			completed: (response) => {
				if (!started || completed) return;
				completed = true;
				try {
					this.metrics.requestDurationMs.record(response.durationMs, {
						outcome: response.errorCode ?? "success",
					});
				} finally {
					if (this.metrics.requestsInFlight) {
						this.metrics.requestsInFlight.add(-1, {});
					}
				}
			},
		};
	}

	private getCandidate(id: string): Candidate | undefined {
		const config = this.config.adapters.find((adapter) => adapter.id === id);
		const adapter = this.adapters.get(id);

		if (!config || !adapter || !config.enabled) {
			return undefined;
		}

		return { adapter, config };
	}

	private takeWeightedCandidate(candidates: Candidate[]): Candidate {
		const weights = candidates.map((candidate) => Math.max(0.1, candidate.config.baseWeight));
		let totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

		if (totalWeight <= 0) {
			totalWeight = candidates.length;
			for (let i = 0; i < weights.length; i++) weights[i] = 1;
		}

		let target = this.random() * totalWeight;
		let selectedIndex = candidates.length - 1;
		for (let i = 0; i < weights.length; i++) {
			target -= weights[i] ?? 1;
			if (target <= 0) {
				selectedIndex = i;
				break;
			}
		}

		const fallback = candidates[0];
		if (!fallback) {
			throw new NetworkSchedulerError(
				"No available network adapter for request",
				"NO_AVAILABLE_ADAPTER",
				503
			);
		}
		const selected = candidates[selectedIndex] ?? fallback;
		candidates.splice(selectedIndex, 1);
		return selected;
	}
}
