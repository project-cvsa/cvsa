import type { NetworkAdapterConfig } from "./dto";
import type { NetworkRequest, NetworkTransportResponse } from "./contracts";

export type NetworkMetricAttributes = Record<string, string | number>;

export interface NetworkAttemptContext {
	request: NetworkRequest;
	adapterId: string;
	adapterType: NetworkAdapterConfig["type"];
}

export interface NetworkAttemptObserver {
	/** Called immediately before the transport sends the HTTP request. */
	started(): void;
	/** Called once after the transport produces a response or failure result. */
	completed(response: NetworkTransportResponse): void;
}

export interface NetworkMetrics {
	requests: {
		add(value: number, attributes: NetworkMetricAttributes): void;
	};
	requestDurationMs: {
		record(value: number, attributes: NetworkMetricAttributes): void;
	};
	scheduleAttempts: {
		record(value: number, attributes: NetworkMetricAttributes): void;
	};
	requestsInFlight?: {
		add(value: number, attributes: NetworkMetricAttributes): void;
	};
	createAttemptObserver?: (context: NetworkAttemptContext) => NetworkAttemptObserver;
}

export function createNoopNetworkMetrics(): NetworkMetrics {
	return {
		requests: { add() {} },
		requestDurationMs: { record() {} },
		scheduleAttempts: { record() {} },
	};
}
