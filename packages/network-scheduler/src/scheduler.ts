import { NetworkSchedulerError } from "./errors";
import { createNoopNetworkSchedulerLogger, type NetworkSchedulerLogger } from "./logger";
import { createNoopNetworkSchedulerTracer, type NetworkSchedulerTracer } from "./tracer";
import { createNoopNetworkMetrics, type NetworkMetrics } from "./telemetry";
import type { NetworkAdapterConfig, NetworkRuntimeConfig } from "./dto";
import type {
	NetworkAdapter,
	NetworkDelegate,
	NetworkErrorCode,
	NetworkRateLimiter,
	NetworkRequest,
	NetworkResponse,
} from "./contracts";

const HEALTH_AFFECTING_ERRORS: ReadonlySet<NetworkErrorCode> = new Set([
	"NETWORK_FAILURE",
	"REQUEST_TIMEOUT",
	"HTTP_429",
	"HTTP_5XX",
]);

function isRetryable(errorCode: NetworkErrorCode | undefined): boolean {
	return (
		errorCode === "NETWORK_FAILURE" ||
		errorCode === "REQUEST_TIMEOUT" ||
		errorCode === "HTTP_429" ||
		errorCode === "HTTP_5XX"
	);
}

const SOFT_RESERVE_WINDOW_SECONDS = 1;

interface SoftReserveParams {
	sharedMax: number;
	reservedQuotas: Map<string, number>;
}

interface SchedulerState {
	readonly config: NetworkRuntimeConfig;
	readonly adapters: ReadonlyMap<string, NetworkAdapter>;
	readonly softReserve: SoftReserveParams;
	healthFactors: Map<string, number>;
	readonly healthConfig: {
		failurePenalty: number;
		recoveryBonus: number;
		minWeightFactor: number;
	};
}

export interface NetworkSchedulerOptions {
	random?: () => number;
	metrics?: NetworkMetrics;
	logger?: NetworkSchedulerLogger;
	tracer?: NetworkSchedulerTracer;
}

export class NetworkScheduler implements NetworkDelegate {
	private readonly random: () => number;
	private readonly metrics: NetworkMetrics;
	private readonly logger: NetworkSchedulerLogger;
	private readonly tracer: NetworkSchedulerTracer;
	private state: Readonly<SchedulerState>;

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
		this.state = this.createState(config, adapters);
	}

	public reload(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>
	): void {
		const previousState = this.state;
		const healthFactors = new Map<string, number>();
		for (const adapterId of adapters.keys()) {
			const previousHealthFactor = previousState.healthFactors.get(adapterId);
			if (previousHealthFactor !== undefined) {
				healthFactors.set(adapterId, previousHealthFactor);
			}
		}
		this.state = this.createState(config, adapters, healthFactors);
	}

	public async execute(request: NetworkRequest): Promise<NetworkResponse> {
		const state = this.state;
		return this.tracer.traceTask("crawler.network.delegate", () =>
			this.executeScheduled(state, request)
		);
	}

	private async executeScheduled(
		state: SchedulerState,
		request: NetworkRequest
	): Promise<NetworkResponse> {
		const requestType = request.requestType;
		const binding = requestType
			? state.config.bindings?.find((item) => item.requestType === requestType)
			: undefined;

		type Candidate = {
			adapter: NetworkAdapter;
			config: NetworkAdapterConfig;
		};

		const adapterIds = binding
			? binding.adapterIds
			: state.config.adapters.map((adapter) => adapter.id);

		const candidates = adapterIds
			.map((id) => this.getCandidate(state, id))
			.filter((candidate): candidate is Candidate => candidate !== undefined);

		if (candidates.length === 0) {
			throw new NetworkSchedulerError(
				"No available network adapter for request type",
				"NO_AVAILABLE_ADAPTER",
				503
			);
		}

		if (requestType && !(await this.admitSoftReserve(state, requestType))) {
			return {
				adapterId: "",
				status: 429,
				headers: {},
				body: "",
				durationMs: 0,
				errorCode: "RATE_LIMITED",
			};
		}

		const effectiveRequestType = requestType ?? "default";

		let lastResponse: NetworkResponse | undefined;
		let attempts = 0;
		while (candidates.length > 0) {
			const candidate = this.takeWeightedCandidate(state, candidates);
			attempts += 1;

			if (!(await this.consumeAdapterLimits(candidate.config))) {
				continue;
			}

			const response = await candidate.adapter.execute(request);
			this.updateHealthFactor(state, candidate.config.id, response.errorCode);
			this.recordRequest(response, effectiveRequestType, attempts);
			this.logger.info("Network request completed", {
				component: "network-scheduler",
				adapterId: candidate.adapter.id,
				requestType: effectiveRequestType,
				durationMs: response.durationMs,
				attempts,
				errorCode: response.errorCode,
			});

			if (!isRetryable(response.errorCode)) return response;
			lastResponse = response;
		}
		if (lastResponse) return lastResponse;
		throw new NetworkSchedulerError(
			"No available network adapter",
			"NO_AVAILABLE_ADAPTER",
			503
		);
	}

	private createState(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>,
		healthFactors: Map<string, number> = new Map()
	): SchedulerState {
		const configSnapshot: NetworkRuntimeConfig = structuredClone(config);
		const adaptersSnapshot = new Map(adapters);
		const healthConfig = {
			failurePenalty: configSnapshot.health?.failurePenalty ?? 0.5,
			recoveryBonus: configSnapshot.health?.recoveryBonus ?? 0.2,
			minWeightFactor: configSnapshot.health?.minWeightFactor ?? 0.05,
		};

		return {
			config: configSnapshot,
			adapters: adaptersSnapshot,
			softReserve: this.computeSoftReserveParams(configSnapshot, adaptersSnapshot),
			healthFactors,
			healthConfig,
		};
	}

	private computeSoftReserveParams(
		config: NetworkRuntimeConfig,
		adapters: ReadonlyMap<string, NetworkAdapter>
	): SoftReserveParams {
		let poolRate = 0;
		for (const [id] of adapters) {
			const adapterConfig = config.adapters.find((a) => a.id === id);
			if (!adapterConfig?.enabled) continue;

			const limits = adapterConfig.rateLimits;
			if (limits.length === 0) continue;

			const minRate = Math.min(...limits.map((l) => l.maxRequests / l.durationSeconds));
			poolRate += minRate;
		}

		const totalShare = Object.values(config.requestTypePolicies).reduce(
			(sum, p) => sum + p.reservedShare,
			0
		);

		const sharedMax = Math.max(
			1,
			Math.ceil(poolRate * (1 - totalShare) * SOFT_RESERVE_WINDOW_SECONDS)
		);
		const reservedQuotas = new Map<string, number>();
		for (const [rt, policy] of Object.entries(config.requestTypePolicies)) {
			if (policy.reservedShare > 0) {
				reservedQuotas.set(
					rt,
					Math.max(
						1,
						Math.ceil(poolRate * policy.reservedShare * SOFT_RESERVE_WINDOW_SECONDS)
					)
				);
			}
		}

		return { sharedMax, reservedQuotas };
	}

	private async admitSoftReserve(state: SchedulerState, requestType: string): Promise<boolean> {
		const policy = state.config.requestTypePolicies[requestType];
		const reservedQuota = state.softReserve.reservedQuotas.get(requestType);

		if (policy?.reservedShare && reservedQuota && reservedQuota > 0) {
			const scope = `soft-reserve:reserved:${requestType}`;
			if (await this.rateLimiter.consume(scope, SOFT_RESERVE_WINDOW_SECONDS, reservedQuota)) {
				return true;
			}
		}

		if (state.softReserve.sharedMax > 0) {
			return this.rateLimiter.consume(
				"soft-reserve:shared",
				SOFT_RESERVE_WINDOW_SECONDS,
				state.softReserve.sharedMax
			);
		}

		return true;
	}

	private async consumeAdapterLimits(config: NetworkAdapterConfig): Promise<boolean> {
		if (config.rateLimits.length === 0) return true;

		for (const limit of config.rateLimits) {
			const scope = `adapter:${config.id}`;
			const allowed = await this.rateLimiter.consume(
				scope,
				limit.durationSeconds,
				limit.maxRequests
			);
			if (!allowed) return false;
		}
		return true;
	}

	private updateHealthFactor(
		state: SchedulerState,
		adapterId: string,
		errorCode: NetworkErrorCode | undefined
	): void {
		const current = state.healthFactors.get(adapterId) ?? 1;

		if (!errorCode || !HEALTH_AFFECTING_ERRORS.has(errorCode)) {
			const next = Math.min(1, current + state.healthConfig.recoveryBonus);
			state.healthFactors.set(adapterId, next);
			return;
		}

		const next = Math.max(
			state.healthConfig.minWeightFactor,
			current * state.healthConfig.failurePenalty
		);
		state.healthFactors.set(adapterId, next);
		if (next < current) {
			this.logger.warn("Network adapter health factor decreased", {
				component: "network-scheduler",
				adapterId,
				healthFactor: next,
			});
		}
	}

	private getHealthFactor(state: SchedulerState, adapterId: string): number {
		return state.healthFactors.get(adapterId) ?? 1;
	}

	private getCandidate(
		state: SchedulerState,
		id: string
	): { adapter: NetworkAdapter; config: NetworkAdapterConfig } | undefined {
		const config = state.config.adapters.find((adapter) => adapter.id === id);
		const adapter = state.adapters.get(id);

		if (!config || !adapter || !config.enabled) {
			return undefined;
		}

		if (this.getHealthFactor(state, id) < state.healthConfig.minWeightFactor) {
			return undefined;
		}
		return { adapter, config };
	}

	private takeWeightedCandidate(
		state: SchedulerState,
		candidates: Array<{ adapter: NetworkAdapter; config: NetworkAdapterConfig }>
	): { adapter: NetworkAdapter; config: NetworkAdapterConfig } {
		const weights = candidates.map(
			(c) => c.config.baseWeight * this.getHealthFactor(state, c.config.id)
		);
		let totalWeight = weights.reduce((sum, w) => sum + w, 0);

		if (totalWeight <= 0) {
			totalWeight = candidates.length;
			for (let i = 0; i < weights.length; i++) weights[i] = 1;
		}

		let target = this.random() * totalWeight;
		let selectedIndex = candidates.length - 1;
		for (let i = 0; i < weights.length; i++) {
			target -= weights[i];
			if (target <= 0) {
				selectedIndex = i;
				break;
			}
		}
		const selected = candidates[selectedIndex];
		candidates.splice(selectedIndex, 1);
		return selected;
	}

	private recordRequest(response: NetworkResponse, requestType: string, attempts: number): void {
		this.metrics.requests.add(1, {
			adapterId: response.adapterId,
			requestType,
			errorCode: response.errorCode ?? "NONE",
		});
		this.metrics.requestDurationMs.record(response.durationMs, {
			adapterId: response.adapterId,
			requestType,
		});
		this.metrics.scheduleAttempts.record(attempts, { requestType });
	}
}
