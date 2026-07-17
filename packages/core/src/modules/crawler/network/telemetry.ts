import { metrics } from "@opentelemetry/api";

export const NETWORK_METRIC_NAMES = {
	requests: "cvsa.crawler.network.requests",
	requestDurationMs: "cvsa.crawler.network.request.duration_ms",
	scheduleAttempts: "cvsa.crawler.network.schedule.attempts",
} as const;

export interface NetworkMetrics {
	requests: {
		add(value: number, attributes: Record<string, string | number>): void;
	};
	requestDurationMs: {
		record(value: number, attributes: Record<string, string | number>): void;
	};
	scheduleAttempts: {
		record(value: number, attributes: Record<string, string | number>): void;
	};
}

export function createNetworkMetrics(): NetworkMetrics {
	const meter = metrics.getMeter("cvsa-crawler");
	return {
		requests: meter.createCounter(NETWORK_METRIC_NAMES.requests),
		requestDurationMs: meter.createHistogram(NETWORK_METRIC_NAMES.requestDurationMs),
		scheduleAttempts: meter.createHistogram(NETWORK_METRIC_NAMES.scheduleAttempts),
	};
}
