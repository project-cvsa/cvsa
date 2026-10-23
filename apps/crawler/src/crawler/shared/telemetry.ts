import { metrics } from "@opentelemetry/api";
import type { CrawlerMetrics } from "./types";

export const CRAWLER_LOG_FIELDS = ["component", "queue", "worker", "aid", "traceId"] as const;

export const CRAWLER_METRIC_NAMES = {
	runtimeStarts: "cvsa.crawler.runtime.starts",
	runtimeShutdowns: "cvsa.crawler.runtime.shutdowns",
	dependencyFailures: "cvsa.crawler.dependency.connection.failures",
} as const;

export function createCrawlerMetrics(): CrawlerMetrics {
	const meter = metrics.getMeter("cvsa-crawler");
	return {
		runtimeStarts: meter.createCounter(CRAWLER_METRIC_NAMES.runtimeStarts),
		runtimeShutdowns: meter.createCounter(CRAWLER_METRIC_NAMES.runtimeShutdowns),
		dependencyFailures: meter.createCounter(CRAWLER_METRIC_NAMES.dependencyFailures),
	};
}
