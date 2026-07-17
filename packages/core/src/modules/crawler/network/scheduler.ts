import { AppError } from "../../../error";
import { traceTask } from "@cvsa/observability";
import { appLogger } from "@cvsa/logger";
import type { NetworkAdapterConfig, NetworkRuntimeConfig } from "./dto";
import type {
	NetworkAdapter,
	NetworkDelegate,
	NetworkErrorCode,
	NetworkRateLimiter,
	NetworkRequest,
	NetworkResponse,
} from "./contracts";
import { createNetworkMetrics, type NetworkMetrics } from "./telemetry";

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

export class NetworkScheduler implements NetworkDelegate {
	private readonly healthFactors = new Map<string, number>();
	private readonly softReserve: SoftReserveParams;

	private readonly healthConfig: { failurePenalty: number; recoveryBonus: number; minWeightFactor: number };

	constructor(
		private readonly config: NetworkRuntimeConfig,
		private readonly adapters: ReadonlyMap<string, NetworkAdapter>,
		private readonly rateLimiter: NetworkRateLimiter,
		private readonly random: () => number = Math.random,
		private readonly metrics: NetworkMetrics = createNetworkMetrics()
	) {
		this.healthConfig = {
			failurePenalty: config.health?.failurePenalty ?? 0.5,
			recoveryBonus: config.health?.recoveryBonus ?? 0.2,
			minWeightFactor: config.health?.minWeightFactor ?? 0.05,
		};
		this.softReserve = this.computeSoftReserveParams();
	}

	async execute(request: NetworkRequest): Promise<NetworkResponse> {
		return traceTask("crawler.network.delegate", () => this.executeScheduled(request));
	}

	private async executeScheduled(request: NetworkRequest): Promise<NetworkResponse> {
		const binding = this.config.bindings.find(
			(item) => item.requestType === request.requestType
		);
		if (!binding)
			throw new AppError("No configured network route", "NO_AVAILABLE_ADAPTER", 503);

		if (!(await this.admitSoftReserve(request.requestType))) {
			return {
				adapterId: "",
				status: 429,
				headers: {},
				body: "",
				durationMs: 0,
				errorCode: "RATE_LIMITED",
			};
		}

		const candidates = binding.adapterIds
			.map((id) => this.getCandidate(id))
			.filter(
				(
					candidate
				): candidate is { adapter: NetworkAdapter; config: NetworkAdapterConfig } =>
					candidate !== undefined
			);

		if (candidates.length === 0) {
			throw new AppError(
				"No available network adapter for request type",
				"NO_AVAILABLE_ADAPTER",
				503
			);
		}

		let lastResponse: NetworkResponse | undefined;
		let attempts = 0;
		while (candidates.length > 0) {
			const candidate = this.takeWeightedCandidate(candidates);
			attempts += 1;

			if (!(await this.consumeAdapterLimits(candidate.config))) {
				continue;
			}

			const response = await candidate.adapter.execute(request);
			this.updateHealthFactor(candidate.config.id, response.errorCode);
			this.recordRequest(response, request.requestType, attempts);
			appLogger.info("Network request completed", {
				component: "network-scheduler",
				adapterId: candidate.adapter.id,
				requestType: request.requestType,
				durationMs: response.durationMs,
				attempts,
				errorCode: response.errorCode,
			});

			if (!isRetryable(response.errorCode)) return response;
			lastResponse = response;
		}
		if (lastResponse) return lastResponse;
		throw new AppError("No available network adapter", "NO_AVAILABLE_ADAPTER", 503);
	}

	private computeSoftReserveParams(): SoftReserveParams {
		let poolRate = 0;
		for (const [id] of this.adapters) {
			const adapterConfig = this.config.adapters.find((a) => a.id === id);
			if (!adapterConfig?.enabled) continue;

			const limits = adapterConfig.rateLimits;
			if (limits.length === 0) continue;

			const minRate = Math.min(
				...limits.map((l) => l.maxRequests / l.durationSeconds)
			);
			poolRate += minRate;
		}

		const totalShare = Object.values(this.config.requestTypePolicies).reduce(
			(sum, p) => sum + p.reservedShare,
			0
		);

		const sharedMax = Math.max(
			1,
			Math.ceil(poolRate * (1 - totalShare) * SOFT_RESERVE_WINDOW_SECONDS)
		);
		const reservedQuotas = new Map<string, number>();
		for (const [rt, policy] of Object.entries(this.config.requestTypePolicies)) {
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

	private async admitSoftReserve(requestType: string): Promise<boolean> {
		const policy = this.config.requestTypePolicies[requestType];

		if (policy?.reservedShare && (this.softReserve.reservedQuotas.get(requestType) ?? 0) > 0) {
			const quota = this.softReserve.reservedQuotas.get(requestType) as number;
			const scope = `soft-reserve:reserved:${requestType}`;
			if (await this.rateLimiter.consume(scope, SOFT_RESERVE_WINDOW_SECONDS, quota)) {
				return true;
			}
		}

		if (this.softReserve.sharedMax > 0) {
			return this.rateLimiter.consume(
				"soft-reserve:shared",
				SOFT_RESERVE_WINDOW_SECONDS,
				this.softReserve.sharedMax
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
		adapterId: string,
		errorCode: NetworkErrorCode | undefined
	): void {
		const current = this.healthFactors.get(adapterId) ?? 1;

		if (!errorCode || !HEALTH_AFFECTING_ERRORS.has(errorCode)) {
			const next = Math.min(1, current + this.healthConfig.recoveryBonus);
			this.healthFactors.set(adapterId, next);
			return;
		}

		const next = Math.max(
			this.healthConfig.minWeightFactor,
			current * this.healthConfig.failurePenalty
		);
		this.healthFactors.set(adapterId, next);
		if (next < current) {
			appLogger.warn("Network adapter health factor decreased", {
				component: "network-scheduler",
				adapterId,
				healthFactor: next,
			});
		}
	}

	private getHealthFactor(adapterId: string): number {
		return this.healthFactors.get(adapterId) ?? 1;
	}

	private getCandidate(
		id: string
	): { adapter: NetworkAdapter; config: NetworkAdapterConfig } | undefined {
		const config = this.config.adapters.find((adapter) => adapter.id === id);
		const adapter = this.adapters.get(id);
		if (!config || !adapter || !config.enabled) return undefined;
		if (this.getHealthFactor(id) <= this.healthConfig.minWeightFactor) return undefined;
		return { adapter, config };
	}

	private takeWeightedCandidate(
		candidates: Array<{ adapter: NetworkAdapter; config: NetworkAdapterConfig }>
	): { adapter: NetworkAdapter; config: NetworkAdapterConfig } {
		const weights = candidates.map(
			(c) => c.config.baseWeight * this.getHealthFactor(c.config.id)
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
