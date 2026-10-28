import { Elysia } from "elysia";
import { z } from "zod";
import {
	AppError,
	CrawlerOverviewStatsSchema,
	CrawlerQueueJobDetailSchema,
	CrawlerQueueJobsQuerySchema,
	CrawlerQueueJobsResponseSchema,
	CrawlerStatsQuerySchema,
	ErrorResponseSchema,
	type CrawlerOverviewStats,
	type CrawlerQueueJobDetail,
	type CrawlerQueueJobItem,
	type CrawlerQueueJobsResponse,
	type CrawlerQueueSnapshot,
	type CrawlerStatsRollupPoint,
	type CrawlerStatsWindow,
} from "@cvsa/contracts";
import type { CrawlerJobCounts } from "../crawler";
import { discoveryQueue, snapshotQueue, statsCollector } from "../container";

const WINDOW_SECONDS: Readonly<Record<CrawlerStatsWindow, number>> = {
	"5m": 5 * 60,
	"15m": 15 * 60,
	"30m": 30 * 60,
	"1h": 60 * 60,
	"6h": 6 * 60 * 60,
	"24h": 24 * 60 * 60,
	"7d": 7 * 24 * 60 * 60,
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

export const statsRoutes = new Elysia()
	.get(
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
			const totalFailures = Object.values(errors).reduce((sum, value) => sum + value, 0);
			const totalAttempts = counters.networkRequests;
			const networkFailures =
				errors.timeout +
				errors.networkFailure +
				errors.httpFailure +
				errors.networkOther +
				errors.rateLimited412Or429 +
				errors.bilibiliBusinessError;

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
				networkFailures,
				errorRate:
					totalAttempts > 0
						? Math.min(1, Math.max(0, networkFailures / totalAttempts))
						: 0,
				retryRate:
					totalAttempts > 0
						? Math.min(1, Math.max(0, overview.metrics.retries / totalAttempts))
						: 0,
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
	)
	.get(
		"/jobs",
		async ({ query }): Promise<CrawlerQueueJobsResponse> => {
			const limit = query.limit ?? 50;
			const targetQueue = query.queue;
			const targetState = query.state;

			const states =
				targetState && targetState !== "all"
					? [targetState]
					: ["active", "waiting", "delayed", "failed"];

			const results: CrawlerQueueJobItem[] = [];

			if (!targetQueue || targetQueue === "all" || targetQueue === "tracking") {
				const jobs = await snapshotQueue.getJobs(states, limit);
				for (const j of jobs) {
					let target: string | null = null;
					if (j.data && typeof j.data === "object" && "aid" in j.data) {
						target = `AID ${String(j.data.aid)}`;
					}
					results.push({
						id: j.id,
						queue: "tracking",
						name: j.name,
						target,
						state: j.state,
						attempts: j.attempts,
						failedReason: j.failedReason,
						timestamp: j.timestamp,
					});
				}
			}

			if (!targetQueue || targetQueue === "all" || targetQueue === "discovery") {
				const jobs = await discoveryQueue.getJobs(states, limit);
				for (const j of jobs) {
					let target: string | null = null;
					if (j.data && typeof j.data === "object") {
						if ("keyword" in j.data) target = `关键词: ${String(j.data.keyword)}`;
						else if ("aid" in j.data) target = `AID ${String(j.data.aid)}`;
					}
					results.push({
						id: j.id,
						queue: "discovery",
						name: j.name,
						target,
						state: j.state,
						attempts: j.attempts,
						failedReason: j.failedReason,
						timestamp: j.timestamp,
					});
				}
			}

			results.sort((a, b) => b.timestamp - a.timestamp);

			return {
				items: results.slice(0, limit),
				total: results.length,
			};
		},
		{
			query: CrawlerQueueJobsQuerySchema,
			response: {
				200: CrawlerQueueJobsResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/jobs/:queue/:id",
		async ({ params }): Promise<CrawlerQueueJobDetail> => {
			const queue = params.queue === "discovery" ? discoveryQueue : snapshotQueue;
			const detail = await queue.getJobDetail(params.id);
			if (!detail) throw new AppError("Job not found", "NOT_FOUND", 404);
			let target: string | null = null;
			if (detail.data && typeof detail.data === "object") {
				if ("aid" in detail.data) target = `AID ${String(detail.data.aid)}`;
				else if ("keyword" in detail.data)
					target = `关键词: ${String(detail.data.keyword)}`;
			}
			return {
				...detail,
				target,
				queue: params.queue,
			};
		},
		{
			params: z.object({ queue: z.string(), id: z.string() }),
			response: {
				200: CrawlerQueueJobDetailSchema,
				404: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/jobs/:queue/:id/retry",
		async ({ params }) => {
			const queue = params.queue === "discovery" ? discoveryQueue : snapshotQueue;
			const ok = await queue.retryJob(params.id);
			if (!ok) throw new AppError("Job not found", "NOT_FOUND", 404);
			return { ok: true };
		},
		{
			params: z.object({ queue: z.string(), id: z.string() }),
			response: {
				200: z.object({ ok: z.boolean() }),
				404: ErrorResponseSchema,
			},
		}
	)
	.delete(
		"/jobs/:queue/:id",
		async ({ params }) => {
			const queue = params.queue === "discovery" ? discoveryQueue : snapshotQueue;
			const ok = await queue.removeJob(params.id);
			if (!ok) throw new AppError("Job not found", "NOT_FOUND", 404);
			return { ok: true };
		},
		{
			params: z.object({ queue: z.string(), id: z.string() }),
			response: {
				200: z.object({ ok: z.boolean() }),
				404: ErrorResponseSchema,
			},
		}
	);
