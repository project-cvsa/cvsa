import { metrics } from "@opentelemetry/api";
import type { NetworkMetrics } from "@cvsa/network-scheduler";

export const NETWORK_METRIC_NAMES = {
	requests: "cvsa.crawler.network.requests",
	requestDurationMs: "cvsa.crawler.network.request.duration_ms",
	scheduleAttempts: "cvsa.crawler.network.schedule.attempts",
} as const;

export function createNetworkMetrics(): NetworkMetrics {
	const meter = metrics.getMeter("cvsa-crawler");
	return {
		requests: meter.createCounter(NETWORK_METRIC_NAMES.requests),
		requestDurationMs: meter.createHistogram(NETWORK_METRIC_NAMES.requestDurationMs),
		scheduleAttempts: meter.createHistogram(NETWORK_METRIC_NAMES.scheduleAttempts),
	};
}
