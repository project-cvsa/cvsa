import {
	CRAWLER_DISCOVERY_RESULTS,
	type CrawlerDistribution,
	CRAWLER_RATE_METRICS,
	CRAWLER_STATS_OUTCOMES,
	type CrawlerStatsMinuteV2,
	type CrawlerStatsOutcomeCounts,
	type CrawlerStatsRatio,
	type CrawlerStatsRatioInputs,
	type CrawlerStatsWindow,
} from "@cvsa/contracts";
import {
	STATS_COUNTERS,
	emptyDiscoveryCounts,
	emptyMinute,
	emptyNetworkTotals,
	emptyOutcomeCounts,
	type StatsMinute,
	type StatsOperation,
	type StatsOutcome,
} from "./types";
import {
	createSketch,
	mergeDistributionInto,
	mergeDistributions as mergeSketchDistributions,
	serializeSketch,
	summarizeDistribution,
	summarizeSketch,
} from "./sketch";

const NETWORK_FIELDS = [
	"attempts",
	"transportSuccess",
	"transportFailure",
	"businessSuccess",
	"businessError",
	"rateLimited",
	"cancelled",
	"timeout",
	"egressResends",
	"sessionResends",
] as const;

export const DEFAULT_QUANTILES = [0.5, 0.9, 0.95, 0.99] as const;

function mergeMinuteScalars(target: StatsMinute, source: StatsMinute): void {
	target.from = Math.min(target.from, source.from);
	target.to = Math.max(target.to, source.to);
	for (const key of STATS_COUNTERS) target.counters[key] += source.counters[key];
	for (const queue of ["tracking", "discovery"] as const)
		for (const outcome of ["completed", "failed", "deferred", "cancelled", "timeout"] as const)
			target.jobs[queue][outcome] += source.jobs[queue][outcome];
	for (const [key, totals] of Object.entries(source.network)) {
		const sum = target.network[key] ?? emptyNetworkTotals();
		for (const field of NETWORK_FIELDS) sum[field] += totals[field];
		target.network[key] = sum;
	}
	for (const [channel, counts] of Object.entries(source.discovery)) {
		const sum = target.discovery[channel] ?? emptyDiscoveryCounts();
		for (const result of CRAWLER_DISCOVERY_RESULTS) sum[result] += counts[result];
		target.discovery[channel] = sum;
	}
	mergeOutcomeRecord(target.database, source.database);
	mergeOutcomeRecord(target.redis, source.redis);
	for (const [key, value] of Object.entries(source.discoveryReasons)) {
		const existing = target.discoveryReasons[key] ?? { accepted: 0, rejected: 0 };
		existing.accepted += value.accepted;
		existing.rejected += value.rejected;
		target.discoveryReasons[key] = existing;
	}
	for (const [key, value] of Object.entries(source.deferrals))
		target.deferrals[key] = (target.deferrals[key] ?? 0) + value;
}

export function mergeMinute(target: StatsMinute, source: StatsMinute): void {
	mergeMinuteScalars(target, source);
	mergeDistributions(target.distributions, source.distributions);
}

function mergeOutcomeRecord(
	target: Record<string, CrawlerStatsOutcomeCounts>,
	source: Record<string, CrawlerStatsOutcomeCounts>
): void {
	for (const [key, counts] of Object.entries(source)) {
		const sum = target[key] ?? emptyOutcomeCounts();
		for (const outcome of CRAWLER_STATS_OUTCOMES) sum[outcome] += counts[outcome];
		target[key] = sum;
	}
}

function accumulateDistributions(
	sketches: Map<string, ReturnType<typeof createSketch>>,
	distributions: Record<string, CrawlerDistribution>
): void {
	for (const key of Object.keys(distributions)) {
		const distribution = distributions[key];
		if (!distribution || distribution.count === 0) continue;
		let sketch = sketches.get(key);
		if (!sketch) {
			sketch = createSketch();
			sketches.set(key, sketch);
		}
		mergeDistributionInto(sketch, distribution);
	}
}

function mergeDistributions(
	target: Record<string, CrawlerDistribution>,
	source: Record<string, CrawlerDistribution>
): void {
	const sketches = new Map<string, ReturnType<typeof createSketch>>();
	accumulateDistributions(sketches, target);
	accumulateDistributions(sketches, source);
	for (const [key, sketch] of sketches) {
		target[key] = serializeSketch(sketch);
	}
}

export function mergeMinutes(
	minutes: readonly StatsMinute[],
	from: number,
	to: number
): StatsMinute {
	const total = emptyMinute(from, to);
	if (minutes.length === 0) return total;
	const sketches = new Map<string, ReturnType<typeof createSketch>>();
	for (const minute of minutes) {
		mergeMinuteScalars(total, minute);
		accumulateDistributions(sketches, minute.distributions);
	}
	for (const [key, sketch] of sketches) {
		total.distributions[key] = serializeSketch(sketch);
	}
	return total;
}

export function distributionKey(operation: StatsOperation, outcome: StatsOutcome): string {
	return `${operation}:${outcome}`;
}

export function summarizeLatency(
	minute: StatsMinute,
	quantiles: readonly number[] = DEFAULT_QUANTILES
): Record<string, ReturnType<typeof summarizeSketch>> {
	const result: Record<string, ReturnType<typeof summarizeSketch>> = {};
	for (const [key, distribution] of Object.entries(minute.distributions)) {
		if (distribution.count === 0) continue;
		result[key] = summarizeDistribution(distribution, quantiles);
	}
	return result;
}

export function ratioInputs(minute: StatsMinute): CrawlerStatsRatioInputs {
	const counters = minute.counters;
	return {
		httpAttemptsFinished: counters.httpAttemptsFinished,
		httpAttemptsCancelled: counters.httpAttemptsCancelled,
		httpTransportSuccess: counters.httpAttemptsTransportSuccess,
		logicalRequests:
			counters.logicalRequestSuccess +
			counters.logicalRequestFailure +
			counters.logicalRequestTimeout,
		logicalRequestSuccess: counters.logicalRequestSuccess,
		egressResends: counters.egressSwitchResends,
		sessionResends: counters.sessionRecoveryResends,
		retriedLogicalRequests: counters.retriedLogicalRequests,
		retriedLogicalRequestSuccess: counters.retriedLogicalRequestSuccess,
		videosRecorded: counters.videosRecorded,
	};
}

function ratio(numerator: number, denominator: number): number | null {
	return denominator > 0 ? numerator / denominator : null;
}

export function computeRatios(minute: StatsMinute): CrawlerStatsRatio {
	const inputs = ratioInputs(minute);
	const httpDenominator = Math.max(0, inputs.httpAttemptsFinished - inputs.httpAttemptsCancelled);
	return {
		httpTransportSuccess: ratio(inputs.httpTransportSuccess, httpDenominator),
		logicalRequestSuccess: ratio(inputs.logicalRequestSuccess, inputs.logicalRequests),
		egressResendShare: ratio(inputs.egressResends, inputs.httpAttemptsFinished),
		sessionResendShare: ratio(inputs.sessionResends, inputs.httpAttemptsFinished),
		retryRecoverySuccess: ratio(
			inputs.retriedLogicalRequestSuccess,
			inputs.retriedLogicalRequests
		),
		requestsPerRecord: ratio(inputs.httpAttemptsFinished, inputs.videosRecorded),
	};
}

export function derivedChartMetrics(minute: StatsMinute): Record<string, number | null> {
	const seconds = Math.max(1, (minute.to - minute.from) / 1000);
	const rates: Record<string, number> = {};
	for (const metric of CRAWLER_RATE_METRICS)
		rates[metric.key] = (minute.counters[metric.counter] * 60) / seconds;
	const ratios = computeRatios(minute);
	const latencies = summarizeLatency(minute);
	const p95 = (operation: StatsOperation) =>
		latencies[distributionKey(operation, "success")]?.quantiles["0.95"] ?? null;
	const percentileSeries = Object.fromEntries(
		(["trackingExecution", "httpAttempt", "modelProcess"] satisfies StatsOperation[]).flatMap(
			(operation) => {
				const sketch = createSketch();
				for (const outcome of CRAWLER_STATS_OUTCOMES) {
					const distribution = minute.distributions[distributionKey(operation, outcome)];
					if (distribution) mergeDistributionInto(sketch, distribution);
				}
				const summary = summarizeSketch(sketch);
				return DEFAULT_QUANTILES.map((quantile) => [
					`latency.${operation}.${quantile}`,
					summary.quantiles[String(quantile)] ?? null,
				]);
			}
		)
	);
	return {
		...rates,
		...percentileSeries,
		"ratios.httpTransportSuccess": ratios.httpTransportSuccess,
		"ratios.logicalRequestSuccess": ratios.logicalRequestSuccess,
		"ratios.egressResendShare": ratios.egressResendShare,
		"ratios.sessionResendShare": ratios.sessionResendShare,
		"ratios.retryRecoverySuccess": ratios.retryRecoverySuccess,
		"ratios.requestsPerRecord": ratios.requestsPerRecord,
		"latencyP95Ms.trackingExecution": p95("trackingExecution"),
		"latencyP95Ms.httpAttempt": p95("httpAttempt"),
		"latencyP95Ms.modelProcess": p95("modelProcess"),
		...Object.fromEntries(
			Object.entries(minute.counters).map(([key, value]) => [`counters.${key}`, value])
		),
	};
}

export function windowMinutes(window: CrawlerStatsWindow): number {
	const map: Record<CrawlerStatsWindow, number> = {
		"5m": 5,
		"15m": 15,
		"30m": 30,
		"1h": 60,
		"6h": 360,
		"24h": 1440,
		"7d": 10080,
	};
	return map[window];
}

export function pickGranularity(
	minutes: number,
	widthMinutes = 1
): { stepMinutes: number; fromHours: boolean } {
	const maxPoints = 240;
	for (const step of [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440]) {
		if (Math.ceil(minutes / step) <= maxPoints)
			return { stepMinutes: Math.max(widthMinutes, step), fromHours: step >= 60 };
	}
	return { stepMinutes: Math.max(widthMinutes, Math.ceil(minutes / maxPoints)), fromHours: true };
}

export function distributionSummariesForPrefix(
	distributions: StatsMinute["distributions"],
	prefix: string
): Record<string, ReturnType<typeof summarizeDistribution>> {
	const grouped = new Map<string, StatsMinute["distributions"][string][]>();
	for (const key of Object.keys(distributions)) {
		if (!key.startsWith(`${prefix}:`)) continue;
		const rest = key.slice(prefix.length + 1);
		const separator = rest.lastIndexOf(":");
		if (separator <= 0) continue;
		const operation = rest.slice(0, separator);
		const entries = grouped.get(operation) ?? [];
		const distribution = distributions[key];
		if (distribution) entries.push(distribution);
		grouped.set(operation, entries);
	}
	return Object.fromEntries(
		[...grouped.entries()].map(([operation, entries]) => [
			operation,
			summarizeDistribution(mergeSketchDistributions(entries)),
		])
	);
}

export function emptyOutcomeRecord(): CrawlerStatsOutcomeCounts {
	return emptyOutcomeCounts();
}

export function isLegacyMinute(metrics: unknown): metrics is CrawlerStatsMinuteV2 {
	return (
		typeof metrics === "object" &&
		metrics !== null &&
		(metrics as { version?: unknown }).version === 2
	);
}
