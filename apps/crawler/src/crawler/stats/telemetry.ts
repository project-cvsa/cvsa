import { createMetricInstruments } from "@cvsa/observability";
import { CRAWLER_LATENCY_BOUNDS_MS } from "@cvsa/contracts";
import type { StatsMetricSink } from "./types";

export const STATS_METRIC_NAMES = {
	events: "cvsa.crawler.events",
	jobResults: "cvsa.crawler.jobs.results",
	discoveryResults: "cvsa.crawler.discovery.results",
	deferrals: "cvsa.crawler.network.deferrals",
	databaseOperations: "cvsa.crawler.database.operations",
	redisOperations: "cvsa.crawler.redis.operations",
	durationMs: "cvsa.crawler.duration_ms",
	queueJobs: "cvsa.crawler.queue.jobs",
	overdueVideos: "cvsa.crawler.tracking.overdue",
	overdueLagSeconds: "cvsa.crawler.tracking.overdue_lag_seconds",
	persistencePending: "cvsa.crawler.stats.pending_minutes",
	persistenceFailures: "cvsa.crawler.stats.write_failures",
} as const;

export function createStatsMetrics(): StatsMetricSink {
	const instruments = createMetricInstruments("cvsa-crawler", (meter) => ({
		events: meter.createCounter(STATS_METRIC_NAMES.events),
		jobResults: meter.createCounter(STATS_METRIC_NAMES.jobResults),
		discoveryResults: meter.createCounter(STATS_METRIC_NAMES.discoveryResults),
		deferrals: meter.createCounter(STATS_METRIC_NAMES.deferrals),
		databaseOperations: meter.createCounter(STATS_METRIC_NAMES.databaseOperations),
		redisOperations: meter.createCounter(STATS_METRIC_NAMES.redisOperations),
		duration: meter.createHistogram(STATS_METRIC_NAMES.durationMs, {
			unit: "ms",
			advice: { explicitBucketBoundaries: [...CRAWLER_LATENCY_BOUNDS_MS] },
		}),
		queueJobs: meter.createGauge(STATS_METRIC_NAMES.queueJobs),
		overdueVideos: meter.createGauge(STATS_METRIC_NAMES.overdueVideos),
		overdueLag: meter.createGauge(STATS_METRIC_NAMES.overdueLagSeconds, { unit: "s" }),
		persistencePending: meter.createGauge(STATS_METRIC_NAMES.persistencePending),
		persistenceFailures: meter.createCounter(STATS_METRIC_NAMES.persistenceFailures),
	}));
	return {
		recordCounter: (kind, count) => instruments().events.add(count, { kind }),
		recordJobOutcome: (queue, outcome) => instruments().jobResults.add(1, { queue, outcome }),
		recordLatency: (operation, outcome, ms) =>
			instruments().duration.record(ms, { operation, outcome }),
		recordDiscovery: (channel, result) =>
			instruments().discoveryResults.add(1, { channel, result }),
		recordDeferral: (reason) => instruments().deferrals.add(1, { reason }),
		recordDatabase: (module, operation, outcome) =>
			instruments().databaseOperations.add(1, { module, operation, outcome }),
		recordRedis: (area, command, outcome) =>
			instruments().redisOperations.add(1, { area, command, outcome }),
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
