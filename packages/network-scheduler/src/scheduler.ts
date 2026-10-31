import { AdaptiveRateConfigSchema, CrawlerExecutionConfigSchema } from "./dto";
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
	HEALTH_AFFECTING_NETWORK_ERROR_CODES,
	RETRYABLE_NETWORK_ERROR_CODES,
	type AdaptiveRateState,
	type NetworkAdapter,
	type NetworkAdapterHealthState,
	type NetworkAdapterRuntimeStatus,
	type NetworkDelegate,
	type NetworkErrorCode,
	type NetworkRateLimiter,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkTransportResponse,
} from "./contracts";

interface SoftReserveParams {
	/**
	 * Soft reserve partitions an already computable request capacity. When no
	 * reserve policy is configured, or when the pool capacity cannot be derived
	 * (no adapter declares a rate limit), the whole mechanism stays disabled
	 * instead of falling back to an implicit one-request-per-second limit.
	 */
	readonly enabled: boolean;
	readonly sharedMax: number;
	readonly windowSeconds: number;
	readonly reservedQuotas: Map<string, number>;
}

interface AdapterHealth {
	degraded: boolean;
	factor: number;
	consecutiveFailures: number;
	openUntil: number | undefined;
	halfOpenProbeInFlight: boolean;
}

interface AdapterStatistics {
	requests: number;
	failures: number;
	rateLimited: number;
	durationMs: number;
	durationSamples: number;
}

interface HealthConfig {
	failurePenalty: number;
	recoveryBonus: number;
	minWeightFactor: number;
	failureThreshold: number;
	cooldownMs: number;
}

type HealthOutcome = "success" | "failure" | "neutral";

interface SchedulerState {
	readonly config: NetworkRuntimeConfig;
	readonly adapters: ReadonlyMap<string, NetworkAdapter>;
	readonly softReserve: SoftReserveParams;
	readonly health: Map<string, AdapterHealth>;
	readonly healthConfig: HealthConfig;
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
	/** Injectable time source so cooldown behaviour is deterministic in tests. */
	clock?: () => number;
}

function healthOutcome(errorCode: NetworkErrorCode | undefined): HealthOutcome {
	if (errorCode === undefined) return "success";
	return HEALTH_AFFECTING_NETWORK_ERROR_CODES.has(errorCode) ? "failure" : "neutral";
}

export class NetworkScheduler implements NetworkDelegate {
	private readonly random: () => number;
	private readonly metrics: NetworkMetrics;
	private readonly logger: NetworkSchedulerLogger;
	private readonly tracer: NetworkSchedulerTracer;
	private readonly clock: () => number;
	private state: Readonly<SchedulerState>;
	private readonly adaptive = new Map<string, AdaptiveRateState>();
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
		this.state = this.createState(config, adapters);
		this.syncStatistics(config);
	}

	/**
	 * Swaps in a new configuration. Health is carried over for adapters that kept
	 * their id, dropped for adapters that disappeared, and initialized to healthy
	 * for adapters that are new. Requests already in flight keep operating on the
	 * state snapshot they started with.
	 */
	public reload(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>
	): void {
		const health = new Map<string, AdapterHealth>();
		for (const adapterId of adapters.keys()) {
			const previous = this.state.health.get(adapterId);
			if (previous) health.set(adapterId, previous);
		}
		this.state = this.createState(config, adapters, health);
		this.syncStatistics(config);
	}

	private syncStatistics(config: NetworkRuntimeConfig): void {
		const ids = new Set(config.adapters.map((adapter) => adapter.id));
		for (const id of this.statistics.keys()) if (!ids.has(id)) this.statistics.delete(id);
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

	/** Diagnostic snapshot of every configured adapter and its current health. */
	public getAdapterStatuses(): NetworkAdapterRuntimeStatus[] {
		const state = this.state;
		return state.config.adapters.map((config) => {
			const health = this.getHealth(state, config.id);
			const healthState = this.getHealthState(health);
			const stats = this.statistics.get(config.id);
			const rates = this.rateStatus(state, config);
			return {
				id: config.id,
				...rates,
				enabled: config.enabled,
				healthState,
				healthFactor: health.factor,
				effectiveWeight:
					config.enabled && healthState !== "open"
						? config.baseWeight * health.factor
						: 0,
				consecutiveFailures: health.consecutiveFailures,
				openUntil: health.openUntil ?? null,
				requests: stats?.requests ?? 0,
				failures: stats?.failures ?? 0,
				rateLimited: stats?.rateLimited ?? 0,
				averageDurationMs: stats?.durationSamples
					? stats.durationMs / stats.durationSamples
					: null,
			};
		});
	}

	public async getAdapterStatusesWithRates(): Promise<NetworkAdapterRuntimeStatus[]> {
		await Promise.all(
			this.state.config.adapters.map(async (config) => {
				const value = await this.rateLimiter.getAdaptiveState?.(`adapter:${config.id}`);
				if (value) this.adaptive.set(config.id, value);
			})
		);
		return this.getAdapterStatuses();
	}

	private rateStatus(state: SchedulerState, config: NetworkAdapterConfig) {
		const policy = AdaptiveRateConfigSchema.parse(state.config.adaptive ?? {});
		const adaptive = this.adaptive.get(config.id);
		const factor = policy.enabled
			? Math.min(1, Math.max(policy.minFactor, adaptive?.factor ?? 1))
			: 1;
		const configuredRate = Math.min(
			config.requestsPerSecond ?? 20,
			...config.rateLimits.map((limit) => limit.maxRequests / limit.durationSeconds)
		);
		const penalized =
			policy.enabled &&
			adaptive?.lastThrottledAt != null &&
			this.clock() < adaptive.lastThrottledAt + policy.backgroundPenaltyMs;
		return {
			configuredRate,
			effectiveRate: configuredRate * factor,
			backgroundRate: configuredRate * factor * (penalized ? policy.backgroundFactor : 1),
			adaptiveFactor: factor,
			lastThrottledAt: adaptive?.lastThrottledAt ?? null,
		};
	}

	private recoveryResponse(state: SchedulerState, ids: string[]): NetworkResponse {
		const execution = CrawlerExecutionConfigSchema.parse(state.config.execution ?? {});
		const waits = ids.map((id) => {
			const health = this.getHealth(state, id);
			return health.halfOpenProbeInFlight
				? execution.probeWaitMs
				: Math.max(execution.probeRetryMs, (health.openUntil ?? 0) - this.clock());
		});
		return {
			adapterId: "",
			status: 503,
			headers: {},
			body: "",
			durationMs: 0,
			errorCode: "NO_AVAILABLE_ADAPTER",
			retryReason: "network_recovery",
			retryAfterMs: Math.min(execution.maxNetworkCooldownMs, Math.max(1, Math.min(...waits))),
		};
	}

	private wait(delay: number, signal?: AbortSignal): Promise<void> {
		signal?.throwIfAborted();
		return new Promise((resolve, reject) => {
			const abort = () => {
				clearTimeout(timer);
				reject(signal?.reason);
			};
			const timer = setTimeout(() => {
				signal?.removeEventListener("abort", abort);
				resolve();
			}, delay);
			signal?.addEventListener("abort", abort, { once: true });
		});
	}

	public async execute(request: NetworkRequest): Promise<NetworkResponse> {
		const state = this.state;
		return this.tracer.traceTask("crawler.network.delegate", async () => {
			const execution = CrawlerExecutionConfigSchema.parse(state.config.execution ?? {});
			const deadline = performance.now() + execution.admissionTimeoutMs;
			let probeWaits = 0;
			while (true) {
				request.signal?.throwIfAborted();
				const response = await this.executeScheduled(state, {
					...request,
					timeoutMs: request.timeoutMs ?? execution.requestTimeoutMs,
				});
				if (
					response.retryReason === "network_recovery" &&
					response.retryAfterMs === execution.probeWaitMs &&
					probeWaits++ < execution.probeRetries
				) {
					await this.wait(execution.probeWaitMs, request.signal);
					continue;
				}
				if (
					response.retryReason !== "local_capacity" ||
					performance.now() + (response.retryAfterMs ?? 50) > deadline
				)
					return response;
				await this.wait(Math.max(1, response.retryAfterMs ?? 50), request.signal);
			}
		});
	}

	private async executeScheduled(
		state: SchedulerState,
		request: NetworkRequest
	): Promise<NetworkResponse> {
		let attempts = 0;
		try {
			const requestType = request.requestType;
			const binding = requestType
				? state.config.bindings?.find((item) => item.requestType === requestType)
				: undefined;

			// A caller that names a request type must hit an explicit binding. Falling
			// back to every adapter would silently send work to exits that were never
			// authorized for that traffic class.
			if (requestType && !binding) {
				throw new NetworkSchedulerError(
					`No adapter binding for request type: ${requestType}`,
					"NO_AVAILABLE_ADAPTER",
					503
				);
			}

			const execution = CrawlerExecutionConfigSchema.parse(state.config.execution ?? {});
			const boundIds = binding
				? binding.adapterIds
				: state.config.adapters.map((adapter) => adapter.id);
			const adapterIds = request.adapterId
				? boundIds.filter((id) => id === request.adapterId)
				: boundIds;
			const enabledIds = adapterIds.filter((id) =>
				state.config.adapters.some((adapter) => adapter.id === id && adapter.enabled)
			);

			const candidates = adapterIds
				.map((id) => this.getCandidate(state, id))
				.filter((candidate): candidate is Candidate => candidate !== undefined);

			if (candidates.length === 0) {
				if (enabledIds.length > 0) return this.recoveryResponse(state, enabledIds);
				throw new NetworkSchedulerError(
					"No available network adapter for request type",
					"NO_AVAILABLE_ADAPTER",
					503
				);
			}

			const effectiveRequestType = requestType ?? "default";
			const cooldownScope = request.cooldownScope ?? effectiveRequestType;
			const cooldown = (await this.rateLimiter.remainingDelay?.(cooldownScope)) ?? 0;
			if (cooldown > 0) return this.rateLimitedResponse(cooldown, "upstream");
			if (
				!this.rateLimiter.reserve &&
				requestType &&
				!(await this.admitSoftReserve(state, requestType))
			)
				return this.rateLimitedResponse(1000);
			let minimumDelay = Infinity;
			let upstreamDelay = Infinity;
			let lastResponse: NetworkResponse | undefined;
			let budgetRefused = false;
			while (candidates.length > 0 && attempts < execution.maxAdapterAttempts) {
				request.signal?.throwIfAborted();
				const candidate = this.takeWeightedCandidate(state, candidates);
				const adapterCooldown =
					(await this.rateLimiter.remainingDelay?.(
						`adapter:${candidate.config.id}:${cooldownScope}`
					)) ?? 0;
				if (adapterCooldown > 0) {
					upstreamDelay = Math.min(upstreamDelay, adapterCooldown);
					continue;
				}

				// getCandidate() is a synchronous pre-filter; the authoritative claim on
				// a half-open probe happens here, once the candidate is actually picked.
				if (!this.beginAttempt(state, candidate.config.id)) continue;

				let admissionDelay: number;
				try {
					admissionDelay = await this.consumeAdapterLimits(
						candidate.config,
						state,
						requestType,
						request.background
					);
				} catch (error) {
					this.releaseHalfOpenProbe(state, candidate.config.id);
					throw error;
				}
				if (admissionDelay > 0) {
					minimumDelay = Math.min(minimumDelay, admissionDelay);
					this.releaseHalfOpenProbe(state, candidate.config.id);
					budgetRefused = true;
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
					if (request.signal?.aborted) {
						this.releaseHalfOpenProbe(state, candidate.config.id);
						throw error;
					}
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
					this.releaseHalfOpenProbe(state, candidate.config.id);
					request.signal.throwIfAborted();
				}
				const stats = this.statistics.get(candidate.config.id);
				if (stats) {
					stats.requests += 1;
					stats.durationMs += response.durationMs;
					stats.durationSamples += 1;
					if (response.errorCode) stats.failures += 1;
					if (
						response.errorCode === "HTTP_429" ||
						response.errorCode === "APPLICATION_RATE_LIMIT"
					)
						stats.rateLimited += 1;
				}
				this.updateHealth(state, candidate.config.id, response.errorCode);
				const throttled =
					response.errorCode === "HTTP_429" ||
					response.errorCode === "APPLICATION_RATE_LIMIT";
				const adaptivePolicy = AdaptiveRateConfigSchema.parse(state.config.adaptive ?? {});
				if (adaptivePolicy.enabled && (throttled || response.errorCode === undefined)) {
					const value = await this.rateLimiter.recordAdaptiveOutcome?.(
						`adapter:${candidate.config.id}`,
						throttled,
						adaptivePolicy
					);
					if (value) this.adaptive.set(candidate.config.id, value);
				}
				this.logger.info("Network request completed", {
					component: "network-scheduler",
					adapterId: candidate.adapter.id,
					requestType: effectiveRequestType,
					durationMs: response.durationMs,
					attempts,
					errorCode: response.errorCode,
				});

				if (
					response.errorCode === "HTTP_429" ||
					response.errorCode === "APPLICATION_RATE_LIMIT"
				) {
					const execution = CrawlerExecutionConfigSchema.parse(
						state.config.execution ?? {}
					);
					const retryAfter = Object.entries(response.headers).find(
						([key]) => key.toLowerCase() === "retry-after"
					)?.[1];
					const seconds = retryAfter ? Number(retryAfter) : 0;
					const delay = Number.isFinite(seconds)
						? seconds * 1000
						: Math.max(0, Date.parse(retryAfter ?? "") - this.clock());
					const retryDelay = Math.max(
						execution.throttleCooldownMs + this.random() * execution.throttleJitterMs,
						Number.isFinite(delay) ? delay : 0
					);
					await this.rateLimiter.defer?.(
						execution.throttleScope === "request_type"
							? cooldownScope
							: `adapter:${candidate.config.id}:${cooldownScope}`,
						retryDelay
					);
					const deferred: NetworkResponse = {
						...response,
						retryAfterMs: retryDelay,
						retryReason: "upstream",
					};
					if (
						execution.throttleFailover &&
						execution.throttleScope === "adapter" &&
						(request.replaySafe ||
							["GET", "HEAD"].includes((request.method ?? "GET").toUpperCase())) &&
						candidates.length > 0 &&
						attempts < execution.maxAdapterAttempts
					) {
						lastResponse = deferred;
						continue;
					}
					return deferred;
				}
				if (response.errorCode === undefined) return response;
				if (!RETRYABLE_NETWORK_ERROR_CODES.has(response.errorCode)) return response;
				if (
					!request.replaySafe &&
					!["GET", "HEAD"].includes((request.method ?? "GET").toUpperCase())
				)
					return response;
				lastResponse = response;
			}
			if (lastResponse) {
				if (
					lastResponse.errorCode === "HTTP_5XX" ||
					lastResponse.retryReason === "upstream"
				)
					return lastResponse;
				return {
					...lastResponse,
					retryReason: "network_recovery",
					retryAfterMs: Math.min(execution.maxNetworkCooldownMs, execution.probeRetryMs),
				};
			}

			// No candidate could be attempted. A refusal by an adapter's own budget is a
			// "retry later" answer, not a missing adapter, so callers can tell the two
			// apart: 429 with `RATE_LIMITED` when a budget turned the request away, and
			// the original 503 when every candidate failed its circuit breaker instead.
			if (Number.isFinite(upstreamDelay) && !budgetRefused)
				return this.rateLimitedResponse(upstreamDelay, "upstream");
			if (budgetRefused)
				return this.rateLimitedResponse(Number.isFinite(minimumDelay) ? minimumDelay : 50);

			return this.recoveryResponse(state, enabledIds);
		} finally {
			this.metrics.scheduleAttempts.record(attempts, {});
		}
	}

	private createDefaultAttemptObserver(): NetworkAttemptObserver {
		let started = false;
		let completed = false;
		return {
			started: () => {
				if (started) return;
				started = true;
				this.metrics.requests.add(1, {});
				this.metrics.requestsInFlight?.add(1, {});
			},
			completed: (response) => {
				if (!started || completed) return;
				completed = true;
				const outcome = this.requestOutcome(response);
				try {
					this.metrics.requestDurationMs.record(response.durationMs, { outcome });
				} finally {
					this.metrics.requestsInFlight?.add(-1, {});
				}
			},
		};
	}

	private requestOutcome(response: NetworkTransportResponse): string {
		if (response.errorCode === undefined) return "success";
		if (response.errorCode === "REQUEST_TIMEOUT") return "timeout";
		if (response.errorCode.startsWith("APPLICATION_")) return "business_error";
		if (response.errorCode.startsWith("HTTP_")) return "http_error";
		if (response.errorCode === "NETWORK_FAILURE") return "connection_error";
		return "other_error";
	}

	/**
	 * The answer for a request that was refused before it reached any adapter.
	 * Built in one place so the soft-reserve and adapter-budget paths cannot drift
	 * apart, and `adapterId` stays empty because no adapter carried the request.
	 */
	private rateLimitedResponse(
		retryAfterMs = 50,
		retryReason: "local_capacity" | "upstream" = "local_capacity"
	): NetworkResponse {
		return {
			adapterId: "",
			status: 429,
			headers: {},
			body: "",
			durationMs: 0,
			errorCode: "RATE_LIMITED",
			retryAfterMs,
			retryReason,
		};
	}

	private createState(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>,
		health: Map<string, AdapterHealth> = new Map()
	): SchedulerState {
		const configSnapshot: NetworkRuntimeConfig = structuredClone(config);
		const adaptersSnapshot = new Map(adapters);
		const healthConfig: HealthConfig = {
			failurePenalty: configSnapshot.health?.failurePenalty ?? 0.85,
			recoveryBonus: configSnapshot.health?.recoveryBonus ?? 0.5,
			minWeightFactor: configSnapshot.health?.minWeightFactor ?? 0.1,
			failureThreshold: configSnapshot.health?.failureThreshold ?? 20,
			cooldownMs: configSnapshot.health?.cooldownMs ?? 10_000,
		};

		return {
			config: configSnapshot,
			adapters: adaptersSnapshot,
			softReserve: this.computeSoftReserveParams(configSnapshot, adaptersSnapshot),
			health,
			healthConfig,
		};
	}

	private computeSoftReserveParams(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>
	): SoftReserveParams {
		const reservedPolicies = Object.entries(config.requestTypePolicies).filter(
			([, policy]) => policy.reservedShare > 0
		);

		if (reservedPolicies.length === 0) {
			return { enabled: false, sharedMax: 0, windowSeconds: 1, reservedQuotas: new Map() };
		}

		let poolRate = 0;
		for (const [id] of adapters) {
			const adapterConfig = config.adapters.find((adapter) => adapter.id === id);
			if (!adapterConfig?.enabled) continue;

			const limits = adapterConfig.rateLimits;

			poolRate += Math.min(
				adapterConfig.requestsPerSecond ?? 20,
				...limits.map((limit) => limit.maxRequests / limit.durationSeconds)
			);
		}

		// No adapter declares a rate limit, so there is no capacity to partition.
		// Soft reserve stays disabled rather than inventing a one-request-per-second
		// budget that would strangle every request carrying a request type.
		if (poolRate <= 0) {
			return { enabled: false, sharedMax: 0, windowSeconds: 1, reservedQuotas: new Map() };
		}

		const totalShare = reservedPolicies.reduce(
			(sum, [, policy]) => sum + policy.reservedShare,
			0
		);
		const windowSeconds = Math.max(
			1,
			1 /
				(poolRate *
					Math.min(
						...reservedPolicies.map(([, policy]) => policy.reservedShare),
						totalShare < 1 ? 1 - totalShare : 1
					))
		);
		const sharedMax = Math.ceil(poolRate * (1 - totalShare) * windowSeconds);

		const reservedQuotas = new Map<string, number>();
		for (const [requestType, policy] of reservedPolicies) {
			reservedQuotas.set(
				requestType,
				Math.max(1, Math.ceil(poolRate * policy.reservedShare * windowSeconds))
			);
		}

		return { enabled: true, windowSeconds, sharedMax: Math.max(0, sharedMax), reservedQuotas };
	}

	private async admitSoftReserve(state: SchedulerState, requestType: string): Promise<boolean> {
		if (!state.softReserve.enabled) return true;

		const reservedQuota = state.softReserve.reservedQuotas.get(requestType);
		if (reservedQuota !== undefined && reservedQuota > 0) {
			const scope = `soft-reserve:reserved:${requestType}`;
			if (
				await this.rateLimiter.consume(
					scope,
					state.softReserve.windowSeconds,
					reservedQuota
				)
			) {
				return true;
			}
		}

		if (state.softReserve.sharedMax > 0) {
			return this.rateLimiter.consume(
				"soft-reserve:shared",
				state.softReserve.windowSeconds,
				state.softReserve.sharedMax
			);
		}

		// Everything is reserved for other request types: a request without its own
		// reservation has no shared capacity left to borrow.
		return false;
	}

	private async consumeAdapterLimits(
		config: NetworkAdapterConfig,
		state: SchedulerState,
		requestType?: string,
		background = false
	): Promise<number> {
		const shared = await this.rateLimiter.getAdaptiveState?.(`adapter:${config.id}`);
		if (shared) this.adaptive.set(config.id, shared);
		const rates = this.rateStatus(state, config);
		const factor = rates.adaptiveFactor;
		const budgets: Array<{ scope?: string; durationSeconds: number; maxRequests: number }> = [
			{ durationSeconds: 1 / ((config.requestsPerSecond ?? 20) * factor), maxRequests: 1 },
			...config.rateLimits.map((limit) => ({
				...limit,
				durationSeconds: limit.durationSeconds / factor,
			})),
		];
		if (background && rates.backgroundRate < rates.effectiveRate)
			budgets.push({
				scope: `background:${config.id}`,
				durationSeconds: 1 / rates.backgroundRate,
				maxRequests: 1,
			});
		if (this.rateLimiter.reserve) {
			const scope = `adapter:${config.id}`;
			if (!requestType || !state.softReserve.enabled)
				return this.rateLimiter.reserve(scope, budgets);
			const quotas = [];
			const reserved = state.softReserve.reservedQuotas.get(requestType);
			if (reserved)
				quotas.push({
					scope: `soft-reserve:reserved:${requestType}`,
					durationSeconds: state.softReserve.windowSeconds,
					maxRequests: reserved,
				});
			if (state.softReserve.sharedMax > 0)
				quotas.push({
					scope: "soft-reserve:shared",
					durationSeconds: state.softReserve.windowSeconds,
					maxRequests: state.softReserve.sharedMax,
				});
			let delay = Infinity;
			for (const quota of quotas) {
				const wait = await this.rateLimiter.reserve(scope, [...budgets, quota]);
				if (wait === 0) return 0;
				delay = Math.min(delay, wait);
			}
			return Number.isFinite(delay) ? delay : 1000;
		}
		for (const budget of budgets) {
			if (
				!(await this.rateLimiter.consume(
					`adapter:${config.id}`,
					budget.durationSeconds,
					budget.maxRequests
				))
			)
				return Math.ceil((budget.durationSeconds * 1000) / budget.maxRequests);
		}
		return 0;
	}

	private updateHealth(
		state: SchedulerState,
		adapterId: string,
		errorCode: NetworkErrorCode | undefined
	): void {
		const health = this.getHealth(state, adapterId);
		const outcome = healthOutcome(errorCode);
		const wasProbing = health.halfOpenProbeInFlight;
		health.halfOpenProbeInFlight = false;

		if (outcome === "success") {
			health.consecutiveFailures = 0;
			if (wasProbing) {
				// A successful probe closes the circuit completely.
				health.openUntil = undefined;
				health.factor = 1;
				health.degraded = false;
			} else {
				health.factor = Math.min(1, health.factor + state.healthConfig.recoveryBonus);
				if (health.factor >= 0.95) health.degraded = false;
			}
			return;
		}

		if (outcome === "neutral") {
			health.consecutiveFailures = 0;
			// A business error still proves the exit delivered a response. Close the
			// circuit if this was the probe, but leave the weight untouched.
			if (wasProbing) health.openUntil = undefined;
			return;
		}

		health.consecutiveFailures += 1;
		// Debounce transient failures before reducing weight.
		if (
			health.consecutiveFailures >= 2 ||
			wasProbing ||
			state.healthConfig.failureThreshold === 1
		) {
			health.factor = Math.max(
				state.healthConfig.minWeightFactor,
				health.factor * state.healthConfig.failurePenalty
			);
			if (health.factor < 0.8) health.degraded = true;
		}
		if (wasProbing || health.consecutiveFailures >= state.healthConfig.failureThreshold) {
			const now = this.clock();
			const cooldown = state.healthConfig.cooldownMs;
			health.openUntil = Math.max(health.openUntil ?? 0, now + cooldown);
		}

		this.logger.warn("Network adapter health changed", {
			component: "network-scheduler",
			adapterId,
			healthState: this.getHealthState(health),
			healthFactor: health.factor,
			consecutiveFailures: health.consecutiveFailures,
			openUntil: health.openUntil ?? null,
		});
	}

	private getHealth(state: SchedulerState, adapterId: string): AdapterHealth {
		const existing = state.health.get(adapterId);
		if (existing) return existing;

		const created: AdapterHealth = {
			degraded: false,
			factor: 1,
			consecutiveFailures: 0,
			openUntil: undefined,
			halfOpenProbeInFlight: false,
		};
		state.health.set(adapterId, created);
		return created;
	}

	private getHealthState(health: AdapterHealth): NetworkAdapterHealthState {
		if (health.openUntil !== undefined) {
			return health.openUntil <= this.clock() ? "half-open" : "open";
		}
		// Enter below 0.8 and recover at 0.95; reading status never changes the state.
		return health.degraded ? "degraded" : "healthy";
	}

	/** Claims the single half-open probe slot, or reports that the adapter is unavailable. */
	private beginAttempt(state: SchedulerState, adapterId: string): boolean {
		const health = this.getHealth(state, adapterId);
		if (health.openUntil === undefined) return true;
		if (health.openUntil > this.clock() || health.halfOpenProbeInFlight) return false;
		health.halfOpenProbeInFlight = true;
		return true;
	}

	private releaseHalfOpenProbe(state: SchedulerState, adapterId: string): void {
		this.getHealth(state, adapterId).halfOpenProbeInFlight = false;
	}

	private getCandidate(state: SchedulerState, id: string): Candidate | undefined {
		const config = state.config.adapters.find((adapter) => adapter.id === id);
		const adapter = state.adapters.get(id);

		if (!config || !adapter || !config.enabled) {
			return undefined;
		}

		const health = this.getHealth(state, id);
		if (health.openUntil !== undefined && health.openUntil > this.clock()) {
			return undefined;
		}
		if (health.halfOpenProbeInFlight) {
			return undefined;
		}
		return { adapter, config };
	}

	private takeWeightedCandidate(state: SchedulerState, candidates: Candidate[]): Candidate {
		const weights = candidates.map(
			(candidate) =>
				candidate.config.baseWeight * this.getHealth(state, candidate.config.id).factor
		);
		let totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

		if (totalWeight <= 0) {
			totalWeight = candidates.length;
			for (let index = 0; index < weights.length; index++) weights[index] = 1;
		}

		let target = this.random() * totalWeight;
		let selectedIndex = candidates.length - 1;
		for (let index = 0; index < weights.length; index++) {
			target -= weights[index];
			if (target <= 0) {
				selectedIndex = index;
				break;
			}
		}
		const selected = candidates[selectedIndex];
		candidates.splice(selectedIndex, 1);
		return selected;
	}
}
