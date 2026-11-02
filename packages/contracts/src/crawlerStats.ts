import { z } from "zod";

export const CRAWLER_WINDOW_MINUTES = {
	"5m": 5,
	"15m": 15,
	"30m": 30,
	"1h": 60,
	"6h": 360,
	"24h": 1440,
	"7d": 10080,
} as const;

export const CrawlerStatsCountersSchema = z.object({
	jobsCompleted: z.number().nonnegative(),
	snapshotsSaved: z.number().nonnegative(),
	videosDiscovered: z.number().nonnegative(),
	candidatesScanned: z.number().nonnegative(),
	inferencesRun: z.number().nonnegative(),
	networkRequests: z.number().nonnegative(),
	aidsRequested: z.number().nonnegative(),
	aidsReturned: z.number().nonnegative(),
	aidsMissing: z.number().nonnegative(),
	candidatesSeen: z.number().nonnegative(),
	candidatesSkipped: z.number().nonnegative(),
	candidatesRejected: z.number().nonnegative(),
	candidatesFailed: z.number().nonnegative(),
});
export type CrawlerStatsCounters = z.infer<typeof CrawlerStatsCountersSchema>;

export const CrawlerStatsErrorsSchema = z.object({
	timeout: z.number().nonnegative(),
	networkFailure: z.number().nonnegative(),
	httpFailure: z.number().nonnegative(),
	networkOther: z.number().nonnegative(),
	adapterUnavailable: z.number().nonnegative(),
	rateLimited412Or429: z.number().nonnegative(),
	bilibiliBusinessError: z.number().nonnegative(),
	inferenceError: z.number().nonnegative(),
	dbError: z.number().nonnegative(),
	other: z.number().nonnegative(),
});
export type CrawlerStatsErrors = z.infer<typeof CrawlerStatsErrorsSchema>;

export const CRAWLER_LATENCY_BOUNDS_MS = [
	1, 2, 5, 10, 25, 50, 100, 200, 350, 500, 750, 1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000,
	60000, 120000, 300000,
] as const;
const histogram = z
	.array(z.number().int().nonnegative())
	.length(CRAWLER_LATENCY_BOUNDS_MS.length + 1);
export const CrawlerNetworkTotalsSchema = z.object({
	requests: z.number().nonnegative(),
	success: z.number().nonnegative(),
	businessErrors: z.number().nonnegative(),
	rateLimited: z.number().nonnegative(),
	transportFailures: z.number().nonnegative(),
});
export type CrawlerNetworkTotals = z.infer<typeof CrawlerNetworkTotalsSchema>;
const jobTotals = z.object({
	completed: z.number().nonnegative(),
	failed: z.number().nonnegative(),
	deferred: z.number().nonnegative(),
});
export const CrawlerMinuteMetricsSchema = z.object({
	from: z.number(),
	to: z.number(),
	counters: CrawlerStatsCountersSchema,
	errors: CrawlerStatsErrorsSchema,
	retries: z.number().nonnegative(),
	latency: z.object({ task: histogram, api: histogram, inference: histogram }),
	latencyMaxMs: z.object({
		task: z.number().nonnegative(),
		api: z.number().nonnegative(),
		inference: z.number().nonnegative(),
	}),
	jobs: z.object({ tracking: jobTotals, discovery: jobTotals }),
	network: z.record(z.string(), CrawlerNetworkTotalsSchema),
	gauges: z
		.object({
			sampledAt: z.number(),
			waiting: z.number().nonnegative(),
			active: z.number().nonnegative(),
			overdue: z.number().nonnegative(),
		})
		.optional(),
});
export type CrawlerMinuteMetrics = z.infer<typeof CrawlerMinuteMetricsSchema>;

export const CRAWLER_RATE_METRICS = [
	{
		key: "snapshotsPerMin",
		counter: "snapshotsSaved",
		label: "overview.newSnapshots",
		unit: "/min",
	},
	{ key: "jobsPerMin", counter: "jobsCompleted", label: "overview.jobsPerSec", unit: "/min" },
	{
		key: "requestsPerMin",
		counter: "networkRequests",
		label: "overview.requestsPerSec",
		unit: "/min",
	},
	{
		key: "inferencesPerMin",
		counter: "inferencesRun",
		label: "overview.inferencesPerSec",
		unit: "/min",
	},
	{
		key: "candidatesPerMin",
		counter: "candidatesScanned",
		label: "overview.candidatesPerMin",
		unit: "/min",
	},
] as const;

export const CRAWLER_ERROR_LABELS = {
	timeout: "overview.err.timeout",
	networkFailure: "overview.err.networkFailure",
	httpFailure: "overview.err.httpFailure",
	networkOther: "overview.err.networkOther",
	adapterUnavailable: "overview.err.adapterUnavailable",
	rateLimited412Or429: "overview.err.rateLimited",
	bilibiliBusinessError: "overview.err.bilibiliBusiness",
	inferenceError: "overview.err.inference",
	dbError: "overview.err.db",
	other: "overview.err.other",
} as const;

export const CRAWLER_CHART_METRICS = [
	...CRAWLER_RATE_METRICS,
	{ key: "errorPercent", label: "overview.errorRate", unit: "%" },
	{ key: "retryPercent", label: "overview.retryRate", unit: "%" },
	{ key: "latencyP95Ms.api", label: "audit.chart.apiLatency", unit: "ms" },
	{ key: "latencyP95Ms.task", label: "audit.chart.taskLatency", unit: "ms" },
	{ key: "latencyP95Ms.inference", label: "metrics.inferenceLatency", unit: "ms" },
	{ key: "queue.waiting", label: "queue.waiting", unit: "" },
	{ key: "queue.active", label: "queue.active", unit: "" },
	{ key: "tracking.overdue", label: "overview.overdueTracking", unit: "" },
] as const;
