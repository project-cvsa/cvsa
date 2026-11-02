import {
	CRAWLER_LATENCY_BOUNDS_MS,
	CRAWLER_RATE_METRICS,
	type CrawlerMinuteMetrics,
	type CrawlerStatsWindow,
} from "@cvsa/contracts";
import {
	emptyCounters,
	emptyErrors,
	STATS_COUNTERS,
	STATS_ERROR_KINDS,
	STATS_LATENCY_KINDS,
	type StatsWindowMetrics,
} from "./types";

export function emptyMinute(from: number, to = from): CrawlerMinuteMetrics {
	return {
		from,
		to,
		counters: emptyCounters(),
		errors: emptyErrors(),
		retries: 0,
		latency: {
			task: Array.from({ length: CRAWLER_LATENCY_BOUNDS_MS.length + 1 }, () => 0),
			api: Array.from({ length: CRAWLER_LATENCY_BOUNDS_MS.length + 1 }, () => 0),
			inference: Array.from({ length: CRAWLER_LATENCY_BOUNDS_MS.length + 1 }, () => 0),
		},
		latencyMaxMs: { task: 0, api: 0, inference: 0 },
		jobs: {
			tracking: { completed: 0, failed: 0, deferred: 0 },
			discovery: { completed: 0, failed: 0, deferred: 0 },
		},
		network: {},
	};
}

export function mergeMinute(target: CrawlerMinuteMetrics, source: CrawlerMinuteMetrics): void {
	if (source.gauges && (!target.gauges || source.gauges.sampledAt > target.gauges.sampledAt))
		target.gauges = source.gauges;
	target.from = Math.min(target.from, source.from);
	target.to = Math.max(target.to, source.to);
	for (const key of STATS_COUNTERS) target.counters[key] += source.counters[key];
	for (const key of STATS_ERROR_KINDS) target.errors[key] += source.errors[key];
	target.retries += source.retries;
	for (const kind of STATS_LATENCY_KINDS) {
		target.latencyMaxMs[kind] = Math.max(target.latencyMaxMs[kind], source.latencyMaxMs[kind]);
		for (let i = 0; i <= CRAWLER_LATENCY_BOUNDS_MS.length; i++)
			target.latency[kind][i] += source.latency[kind][i] ?? 0;
	}
	for (const queue of ["tracking", "discovery"] as const) {
		for (const outcome of ["completed", "failed", "deferred"] as const)
			target.jobs[queue][outcome] += source.jobs[queue][outcome];
	}
	for (const [key, totals] of Object.entries(source.network)) {
		const sum = target.network[key] ?? {
			requests: 0,
			success: 0,
			businessErrors: 0,
			rateLimited: 0,
			transportFailures: 0,
		};
		sum.requests += totals.requests;
		sum.success += totals.success;
		sum.businessErrors += totals.businessErrors;
		sum.rateLimited += totals.rateLimited;
		sum.transportFailures += totals.transportFailures;
		target.network[key] = sum;
	}
}

function p95(histogram: number[], maximum: number): number {
	const target = Math.ceil(histogram.reduce((sum, n) => sum + n, 0) * 0.95);
	if (target === 0) return 0;
	let count = 0;
	for (let i = 0; i < histogram.length; i++) {
		count += histogram[i] ?? 0;
		if (count >= target) return CRAWLER_LATENCY_BOUNDS_MS[i] ?? maximum;
	}
	return 0;
}

export function windowMetrics(
	window: CrawlerStatsWindow,
	metrics: CrawlerMinuteMetrics
): StatsWindowMetrics {
	return {
		...metrics,
		window,
		latencyP95Ms: {
			task: p95(metrics.latency.task, metrics.latencyMaxMs.task),
			api: p95(metrics.latency.api, metrics.latencyMaxMs.api),
			inference: p95(metrics.latency.inference, metrics.latencyMaxMs.inference),
		},
	};
}

export function derivedMetrics(metrics: StatsWindowMetrics) {
	const seconds = Math.max(1, (metrics.to - metrics.from) / 1000);
	const requests = metrics.counters.networkRequests;
	const errors = metrics.errors;
	const networkFailures =
		errors.timeout +
		errors.networkFailure +
		errors.httpFailure +
		errors.networkOther +
		errors.rateLimited412Or429;
	const errorRate = requests > 0 ? networkFailures / requests : 0;
	const retryRate = requests > 0 ? metrics.retries / requests : 0;
	const businessErrorRate = requests > 0 ? errors.bilibiliBusinessError / requests : 0;
	const rates = {
		snapshotsPerMin: 0,
		jobsPerMin: 0,
		requestsPerMin: 0,
		inferencesPerMin: 0,
		candidatesPerMin: 0,
	};
	for (const metric of CRAWLER_RATE_METRICS)
		rates[metric.key] = (metrics.counters[metric.counter] * 60) / seconds;
	return {
		...rates,
		jobsPerSec: metrics.counters.jobsCompleted / seconds,
		requestsPerSec: requests / seconds,
		inferencesPerSec: metrics.counters.inferencesRun / seconds,
		networkFailures,
		errorRate,
		retryRate,
		businessErrorRate,
		requestSuccessRate:
			requests > 0
				? (requests - networkFailures - errors.bilibiliBusinessError) / requests
				: 0,
		errorPercent: errorRate * 100,
		retryPercent: retryRate * 100,
	};
}

export function chartMetrics(metrics: StatsWindowMetrics): Record<string, number> {
	return {
		...derivedMetrics(metrics),
		...(metrics.gauges
			? {
					"queue.waiting": metrics.gauges.waiting,
					"queue.active": metrics.gauges.active,
					"tracking.overdue": metrics.gauges.overdue,
				}
			: {}),
		...Object.fromEntries(
			Object.entries(metrics.counters).map(([k, v]) => [`counters.${k}`, v])
		),
		"latencyP95Ms.task": metrics.latencyP95Ms.task,
		"latencyP95Ms.api": metrics.latencyP95Ms.api,
		"latencyP95Ms.inference": metrics.latencyP95Ms.inference,
	};
}
