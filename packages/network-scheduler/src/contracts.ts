import type { NetworkAttemptObserver } from "./telemetry";

// Re-exported so the adapter, scheduler and transport contracts can be
// satisfied from a single import surface without leaking the telemetry module.
export type {
	NetworkAttemptContext,
	NetworkAttemptObserver,
	NetworkMetricAttributes,
} from "./telemetry";

export type NetworkErrorCode =
	| "NO_AVAILABLE_ADAPTER"
	| "NETWORK_FAILURE"
	| "REQUEST_TIMEOUT"
	| "HTTP_429"
	| "HTTP_5XX"
	| "HTTP_4XX"
	| "APPLICATION_RATE_LIMIT"
	| "APPLICATION_ERROR"
	| "RATE_LIMITED";

/**
 * Errors caused by the exit itself: the adapter could not deliver a usable
 * response because of the network path or the proxy. Only these codes reduce adapter health. HTTP 5xx may trigger bounded failover without a health penalty.
 *
 * `APPLICATION_ERROR` is deliberately excluded. A business error reported by the
 * upstream application (the resource does not exist, is not visible, the caller
 * lacks permission) says nothing about the health of the exit that carried the
 * request, so it must neither be retried nor degrade the adapter.
 */
export const HEALTH_AFFECTING_NETWORK_ERROR_CODES: ReadonlySet<NetworkErrorCode> = new Set([
	"NETWORK_FAILURE",
	"REQUEST_TIMEOUT",
]);

/** Codes worth retrying on another adapter within the same call. */
export const RETRYABLE_NETWORK_ERROR_CODES: ReadonlySet<NetworkErrorCode> = new Set([
	...HEALTH_AFFECTING_NETWORK_ERROR_CODES,
	"HTTP_5XX",
]);

export interface NetworkApplicationErrorContext {
	status: number;
	headers: Record<string, string>;
	body: string;
}

export type NetworkApplicationErrorClassifier = (
	context: NetworkApplicationErrorContext
) => NetworkErrorCode | undefined;

export interface NetworkRequestContext {
	endpoint?: string;
	aid?: string;
	bvid?: string;
	keyword?: string;
	batchSize?: number;
	jobId?: string;
	[key: string]: unknown;
}

export interface NetworkRequest {
	url: string;
	requestType?: string;
	cooldownScope?: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	adapterId?: string;
	background?: boolean;
	replaySafe?: boolean;
	context?: NetworkRequestContext;
}

export interface NetworkResponse {
	adapterId: string;
	status: number;
	headers: Record<string, string>;
	body: string;
	durationMs: number;
	errorCode?: NetworkErrorCode;
	retryAfterMs?: number;
	retryReason?: "local_capacity" | "upstream" | "network_recovery";
}

export interface NetworkTransportResponse {
	status: number;
	headers: Record<string, string>;
	body: string;
	durationMs: number;
	errorCode?: NetworkErrorCode;
}

export interface NetworkDelegate {
	execute(request: NetworkRequest): Promise<NetworkResponse>;
}

export interface NetworkAdapter {
	readonly id: string;
	execute(request: NetworkRequest, observer?: NetworkAttemptObserver): Promise<NetworkResponse>;
}

export interface NetworkTransport {
	execute(
		request: NetworkRequest,
		proxyUrl?: string,
		observer?: NetworkAttemptObserver
	): Promise<NetworkTransportResponse>;
}

export interface AdaptiveRateState {
	factor: number;
	successes: number;
	lastThrottledAt: number | null;
}

export interface NetworkRateLimiter {
	getAdaptiveState?(scope: string): Promise<AdaptiveRateState>;
	recordAdaptiveOutcome?(
		scope: string,
		throttled: boolean,
		policy: import("./dto").AdaptiveRateConfig
	): Promise<AdaptiveRateState>;
	reserve?(
		scope: string,
		budgets: ReadonlyArray<{ scope?: string; durationSeconds: number; maxRequests: number }>
	): Promise<number>;
	consume(scope: string, durationSeconds: number, maxRequests: number): Promise<boolean>;
	defer?(scope: string, delayMs: number): Promise<void>;
	remainingDelay?(scope: string): Promise<number>;
	close?(): Promise<void>;
}

/** Observable health of a single adapter, derived from its request outcomes. */
export type NetworkAdapterHealthState = "healthy" | "degraded" | "open" | "half-open";

export interface NetworkAdapterRuntimeStatus {
	id: string;
	enabled: boolean;
	healthState?: NetworkAdapterHealthState;
	healthFactor?: number;
	effectiveWeight?: number;
	consecutiveFailures?: number;
	/** Epoch milliseconds until which the adapter stays isolated, or `null`. */
	openUntil?: number | null;
	/** Counts since this scheduler instance started, including retries. */
	requests: number;
	failures: number;
	rateLimited?: number;
	averageDurationMs: number | null;
	configuredRate?: number;
	effectiveRate?: number;
	backgroundRate?: number;
	adaptiveFactor?: number;
	lastThrottledAt?: number | null;
}
