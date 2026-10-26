import { metrics } from "@opentelemetry/api";
import type {
	NetworkMetricAttributes,
	NetworkMetrics,
	NetworkRequest,
} from "@cvsa/network-scheduler";
import {
	createNetworkRequestMetricRecorder,
	parseNetworkRequestOutcome,
	type NetworkRequestMetricSink,
	type NetworkRequestOutcome,
} from "./requestMetrics";

export const NETWORK_METRIC_NAMES = {
	requests: "cvsa.crawler.network.requests",
	requestDurationMs: "cvsa.crawler.network.request.duration_ms",
	scheduleAttempts: "cvsa.crawler.network.schedule.attempts",
	requestsInFlight: "cvsa.crawler.network.requests.in_flight",
} as const;

export interface NetworkMetricsHooks {
	/**
	 * Called once per finished HTTP attempt with the measured latency and the
	 * normalized outcome. This is what feeds the in-memory sliding-window stats
	 * without making the stats package depend on OpenTelemetry.
	 */
	onRequestFinished?(latencyMs: number, outcome: NetworkRequestOutcome): void;
	/** Request type/endpoint of the attempt, for per-endpoint breakdowns. */
	onRequestFinishedWithAttributes?(
		latencyMs: number,
		outcome: NetworkRequestOutcome,
		attributes: NetworkMetricAttributes
	): void;
}

/**
 * OpenTelemetry-backed `NetworkMetrics` for the crawler.
 *
 * The scheduler falls back to `createDefaultAttemptObserver` (empty attributes)
 * when `createAttemptObserver` is absent, so wiring the recorder here is a
 * strict upgrade: every attempt gains `requestType` / `endpoint` / `egress`
 * labels plus the in-flight gauge, and the crawler stats collector gets a
 * callback for its sliding windows.
 */
export function createNetworkMetrics(hooks: NetworkMetricsHooks = {}): NetworkMetrics {
	const meter = metrics.getMeter("cvsa-crawler");
	const requests = meter.createCounter(NETWORK_METRIC_NAMES.requests);
	const requestDurationMs = meter.createHistogram(NETWORK_METRIC_NAMES.requestDurationMs);
	const scheduleAttempts = meter.createHistogram(NETWORK_METRIC_NAMES.scheduleAttempts);
	const requestsInFlight = meter.createUpDownCounter(NETWORK_METRIC_NAMES.requestsInFlight);

	const sink: NetworkRequestMetricSink = {
		requestStarted(attributes: NetworkMetricAttributes): void {
			requests.add(1, attributes);
		},
		requestDurationMs(value: number, attributes: NetworkMetricAttributes): void {
			requestDurationMs.record(value, attributes);
			const outcome = parseNetworkRequestOutcome(attributes.outcome);
			hooks.onRequestFinished?.(value, outcome);
			hooks.onRequestFinishedWithAttributes?.(value, outcome, attributes);
		},
		requestsInFlight(delta: number, attributes: NetworkMetricAttributes): void {
			requestsInFlight.add(delta, attributes);
		},
	};

	const recorder = createNetworkRequestMetricRecorder(sink);

	return {
		requests: { add: (value, attributes) => requests.add(value, attributes) },
		requestDurationMs: {
			record: (value, attributes) => requestDurationMs.record(value, attributes),
		},
		scheduleAttempts: {
			record: (value, attributes) => scheduleAttempts.record(value, attributes),
		},
		requestsInFlight: {
			add: (value, attributes) => requestsInFlight.add(value, attributes),
		},
		createAttemptObserver: (context: {
			request: NetworkRequest;
			adapterId: string;
			adapterType: "direct" | "http-proxy";
		}) => recorder.createAttemptObserver(context),
	};
}
