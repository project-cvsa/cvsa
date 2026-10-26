import { Elysia } from "elysia";
import {
	CrawlerOverviewStatsSchema,
	CrawlerStatsQuerySchema,
	ErrorResponseSchema,
	type CrawlerOverviewStats,
	type CrawlerQueueSnapshot,
	type CrawlerStatsRollupPoint,
	type CrawlerStatsWindow,
} from "@cvsa/contracts";
import type { CrawlerJobCounts } from "../crawler";
import { discoveryQueue, snapshotQueue, statsCollector } from "../container";

const WINDOW_SECONDS: Readonly<Record<CrawlerStatsWindow, number>> = {
	"5m": 5 * 60,
	"1h": 60 * 60,
	"24h": 24 * 60 * 60,
};

const QUEUE_KEYS: Readonly<Record<string, string>> = {
	"snapshot-batch": "tracking",
	"crawler-discovery": "discovery",
};

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return Object.fromEntries(Object.entries(value));
}

/** P95 timings and counters are nested; the chart contract wants one flat map. */
function flattenMetrics(value: unknown, prefix = ""): Record<string, number> {
	const source = asRecord(value);
	if (!source) return {};

	const flat: Record<string, number> = {};
	for (const [key, item] of Object.entries(source)) {
		const name = prefix ? `${prefix}.${key}` : key;
		if (typeof item === "number" && Number.isFinite(item)) {
			flat[name] = item;
			continue;
		}
		if (typeof item === "object" && item !== null && !Array.isArray(item)) {
			Object.assign(flat, flattenMetrics(item, name));
		}
	}
	return flat;
}

function toQueueSnapshot(counts: CrawlerJobCounts): CrawlerQueueSnapshot {
	return {
		waiting: counts.waiting,
		active: counts.active,
		delayed: counts.delayed,
		failed: counts.failed,
		// BullMQ's normalized counts do not expose the oldest waiting job, and the
		// admin console treats a missing value as "unknown" rather than "zero".
		oldestWaitSec: 0,
	};
}

async function readQueues(): Promise<Record<string, CrawlerQueueSnapshot>> {
	const [snapshot, discovery] = await Promise.allSettled([
		snapshotQueue.getJobCounts(),
		discoveryQueue.getJobCounts(),
	]);

	const queues: Record<string, CrawlerQueueSnapshot> = {};
	if (snapshot.status === "fulfilled") {
		queues[QUEUE_KEYS["snapshot-batch"] ?? "snapshot-batch"] = toQueueSnapshot(snapshot.value);
	}
	if (discovery.status === "fulfilled") {
		queues[QUEUE_KEYS["crawler-discovery"] ?? "crawler-discovery"] = toQueueSnapshot(
			discovery.value
		);
	}
	return queues;
}

async function readSeries(window: CrawlerStatsWindow): Promise<CrawlerStatsRollupPoint[]> {
	const since = new Date(Date.now() - WINDOW_SECONDS[window] * 1_000);
	try {
		const rows = await statsCollector.getHistory(window, since);
		return rows.map((row) => ({
			bucketTime: row.bucketTime,
			metricGroup: `crawler:${window}`,
			metrics: flattenMetrics(row.metrics),
		}));
	} catch {
		// Rollup history is a chart nicety; the live counters must still answer.
		return [];
	}
}

export const statsRoutes = new Elysia().get(
	"/overview",
	async ({ query }): Promise<CrawlerOverviewStats> => {
		const window = query.window;
		const [overview, queues, series] = await Promise.all([
			statsCollector.getOverviewStats(window),
			readQueues(),
			readSeries(window),
		]);

		const windowSeconds = WINDOW_SECONDS[window];
		const windowMinutes = windowSeconds / 60;
		const counters = overview.metrics.counters;
		const errors = overview.metrics.errors;
		const totalAttempts = counters.networkRequests;
		const totalFailures = Object.values(errors).reduce((sum, value) => sum + value, 0);

		return {
			window,
			jobsPerSec: counters.jobsCompleted / windowSeconds,
			jobsPerMin: counters.jobsCompleted / windowMinutes,
			snapshotsPerMin: counters.snapshotsSaved / windowMinutes,
			candidatesPerMin: counters.candidatesScanned / windowMinutes,
			inferencesPerSec: counters.inferencesRun / windowSeconds,
			requestsPerSec: counters.networkRequests / windowSeconds,
			totalAttempts,
			totalFailures,
			errorRate: totalAttempts > 0 ? totalFailures / totalAttempts : 0,
			retryRate: totalAttempts > 0 ? overview.metrics.retries / totalAttempts : 0,
			breakdown: errors,
			overdueTrackingCount: overview.tracking.overdueCount,
			maxOverdueLagSec: overview.tracking.maxOverdueLagSec,
			queues,
			latencyMs: {
				taskP95: overview.metrics.latencyP95Ms.task,
				apiP95: overview.metrics.latencyP95Ms.api,
				inferenceP95: overview.metrics.latencyP95Ms.inference,
			},
			series,
		};
	},
	{
		query: CrawlerStatsQuerySchema,
		response: {
			200: CrawlerOverviewStatsSchema,
			401: ErrorResponseSchema,
			422: ErrorResponseSchema,
		},
	}
);
