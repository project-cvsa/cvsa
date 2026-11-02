import { createMetricInstruments } from "@cvsa/observability";
import { CRAWLER_LATENCY_BOUNDS_MS } from "@cvsa/contracts";
import type { StatsMetricSink } from "./types";

export const STATS_METRIC_NAMES = {
	events: "cvsa.crawler.events",
	errors: "cvsa.crawler.errors",
	jobResults: "cvsa.crawler.jobs.results",
	retries: "cvsa.crawler.network.retries",
	durationMs: "cvsa.crawler.duration_ms",
	queueJobs: "cvsa.crawler.queue.jobs",
	overdueVideos: "cvsa.crawler.tracking.overdue",
	overdueLagSeconds: "cvsa.crawler.tracking.overdue_lag_seconds",
} as const;

export function createStatsMetrics(): StatsMetricSink {
	const instruments = createMetricInstruments("cvsa-crawler", (meter) => ({
		events: meter.createCounter(STATS_METRIC_NAMES.events),
		errors: meter.createCounter(STATS_METRIC_NAMES.errors),
		jobResults: meter.createCounter(STATS_METRIC_NAMES.jobResults),
		retries: meter.createCounter(STATS_METRIC_NAMES.retries),
		duration: meter.createHistogram(STATS_METRIC_NAMES.durationMs, {
			unit: "ms",
			advice: { explicitBucketBoundaries: [...CRAWLER_LATENCY_BOUNDS_MS] },
		}),
		queueJobs: meter.createGauge(STATS_METRIC_NAMES.queueJobs),
		overdueVideos: meter.createGauge(STATS_METRIC_NAMES.overdueVideos),
		overdueLag: meter.createGauge(STATS_METRIC_NAMES.overdueLagSeconds, { unit: "s" }),
	}));
	return {
		recordCounter: (kind, count) => instruments().events.add(count, { kind }),
		recordError: (kind) => instruments().errors.add(1, { kind }),
		recordJobOutcome: (queue, outcome) => instruments().jobResults.add(1, { queue, outcome }),
		recordLatency: (kind, ms) => instruments().duration.record(ms, { kind }),
		recordRetry: (count) => instruments().retries.add(count),
		recordQueue(queue, counts) {
			for (const [state, count] of Object.entries(counts))
				instruments().queueJobs.record(count, { queue, state });
		},
		recordTracking(tracking) {
			instruments().overdueVideos.record(tracking.overdueCount);
			instruments().overdueLag.record(tracking.maxOverdueLagSec);
		},
	};
}
