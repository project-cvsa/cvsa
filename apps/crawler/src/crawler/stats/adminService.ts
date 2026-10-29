import {
	AppError,
	type CrawlerOverviewStats,
	type CrawlerQueueJobDetail,
	type CrawlerQueueJobItem,
	type CrawlerQueueJobsResponse,
	type CrawlerQueueJobsQuery,
	type CrawlerQueueSnapshot,
	type CrawlerStatsRollupPoint,
	type CrawlerStatsWindow,
	type CrawlerQueueName,
	type CrawlerStatsQuery,
} from "@cvsa/contracts";
import type { JobType } from "bullmq";
import type { CrawlerQueue, CrawlerJobCounts, CrawlerQueueJobSnapshot } from "../shared/types";
import type { CrawlerStatsCollector } from "./collector";
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

async function readQueue(queue: CrawlerQueue<unknown>): Promise<CrawlerQueueSnapshot> {
	const counts = await queue.getJobCounts();
	const oldest =
		counts.waiting > 0 ? await queue.getJobs(["waiting"], 1, counts.waiting - 1) : [];
	return {
		waiting: counts.waiting,
		active: counts.active,
		delayed: counts.delayed,
		failed: counts.failed,
		oldestWaitSec: oldest[0] ? Math.max(0, (Date.now() - oldest[0].timestamp) / 1000) : 0,
	};
}

async function readQueues(
	snapshotQueue: CrawlerQueue<unknown>,
	discoveryQueue: CrawlerQueue<unknown>
): Promise<Record<string, CrawlerQueueSnapshot>> {
	const [snapshot, discovery] = await Promise.allSettled([
		readQueue(snapshotQueue),
		readQueue(discoveryQueue),
	]);

	const queues: Record<string, CrawlerQueueSnapshot> = {};
	if (snapshot.status === "fulfilled") {
		queues[QUEUE_KEYS["snapshot-batch"] ?? "snapshot-batch"] = snapshot.value;
	}
	if (discovery.status === "fulfilled") {
		queues[QUEUE_KEYS["crawler-discovery"] ?? "crawler-discovery"] = discovery.value;
	}
	return queues;
}

export function seriesMetrics(
	metrics: Record<string, number>,
	windowSeconds: number
): Record<string, number> {
	const requests = metrics["counters.networkRequests"] ?? 0;
	const networkFailures = [
		"timeout",
		"networkFailure",
		"httpFailure",
		"networkOther",
		"rateLimited412Or429",
		"bilibiliBusinessError",
	].reduce((total, key) => total + (metrics[`errors.${key}`] ?? 0), 0);
	return {
		...metrics,
		snapshotsPerMin: (metrics["counters.snapshotsSaved"] ?? 0) / (windowSeconds / 60),
		requestsPerSec: requests / windowSeconds,
		errorPercent: requests > 0 ? Math.min(100, (networkFailures / requests) * 100) : 0,
		retryPercent: requests > 0 ? Math.min(100, ((metrics.retries ?? 0) / requests) * 100) : 0,
	};
}

/** Effective window duration: an explicit `minutes` range overrides the preset. */
function windowSecondsFor(window: CrawlerStatsWindow, minutes?: number): number {
	return minutes === undefined ? WINDOW_SECONDS[window] : minutes * 60;
}

async function readSeries(
	statsCollector: CrawlerStatsCollector,
	window: CrawlerStatsWindow,
	minutes?: number
): Promise<CrawlerStatsRollupPoint[]> {
	const windowSeconds = windowSecondsFor(window, minutes);
	const since = new Date(Date.now() - windowSeconds * 1_000);
	try {
		const rows = await statsCollector.getHistory(window, since);
		return rows.map((row) => ({
			bucketTime: row.bucketTime,
			metricGroup: `crawler:${window}`,
			// Chart rates must divide by the range the operator actually asked for;
			// reusing the preset width mislabels custom ranges (e.g. 90 minutes).
			metrics: seriesMetrics(flattenMetrics(row.metrics), windowSeconds),
		}));
	} catch {
		// Rollup history is a chart nicety; the live counters must still answer.
		return [];
	}
}

function jobItem(job: CrawlerQueueJobSnapshot, queue: CrawlerQueueName): CrawlerQueueJobItem {
	const data = job.data;
	let target: string | null = null;
	if (typeof data === "object" && data !== null) {
		if ("aid" in data) target = String(data.aid);
		else if ("aids" in data && Array.isArray(data.aids))
			target = data.aids.map(String).join(", ");
		else if (
			"config" in data &&
			typeof data.config === "object" &&
			data.config !== null &&
			"keywords" in data.config &&
			Array.isArray(data.config.keywords)
		)
			target = data.config.keywords.join(", ");
	}
	return {
		id: job.id,
		queue,
		name: job.name,
		state: job.state,
		target,
		attempts: job.attempts,
		failedReason: job.failedReason,
		timestamp: job.timestamp,
	};
}

export class CrawlerAdminStatsService {
	constructor(
		private readonly queues: Record<CrawlerQueueName, CrawlerQueue<unknown>>,
		private readonly collector: CrawlerStatsCollector
	) {}

	async overview(query: CrawlerStatsQuery): Promise<CrawlerOverviewStats> {
		const { window, minutes } = query;

		const [overview, queues, series] = await Promise.all([
			this.collector.getOverviewStats(window, minutes),
			readQueues(this.queues.tracking, this.queues.discovery),
			readSeries(this.collector, window, minutes),
		]);

		const windowSeconds = windowSecondsFor(window, minutes);
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
			minutes,
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
				totalAttempts > 0 ? Math.min(1, Math.max(0, networkFailures / totalAttempts)) : 0,
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
	}

	async jobs(query: CrawlerQueueJobsQuery): Promise<CrawlerQueueJobsResponse> {
		const names: CrawlerQueueName[] =
			query.queue && query.queue !== "all" ? [query.queue] : ["tracking", "discovery"];
		const states: Array<keyof CrawlerJobCounts> =
			query.state && query.state !== "all"
				? [query.state]
				: ["active", "waiting", "delayed", "failed", "completed"];
		const counts = new Map(
			await Promise.all(
				names.map(
					async (name) =>
						[name, await this.queues[name].getJobCounts()] satisfies [
							CrawlerQueueName,
							CrawlerJobCounts,
						]
				)
			)
		);
		const total = names.reduce(
			(sum, name) =>
				sum + states.reduce((n, state) => n + (counts.get(name)?.[state] ?? 0), 0),
			0
		);
		const items: CrawlerQueueJobItem[] = [];
		let offset = query.offset ?? 0;
		for (const state of states) {
			for (const name of names) {
				const count = counts.get(name)?.[state] ?? 0;
				if (offset >= count) {
					offset -= count;
					continue;
				}
				const types: JobType[] = [state];
				const rows = await this.queues[name].getJobs(
					types,
					Math.min(query.limit - items.length, count - offset),
					offset
				);
				items.push(...rows.map((row) => jobItem(row, name)));
				offset = 0;
				if (items.length >= query.limit) return { items, total };
			}
		}
		return { items, total };
	}

	async detail(queue: CrawlerQueueName, id: string): Promise<CrawlerQueueJobDetail> {
		const detail = await this.queues[queue].getJobDetail(id);
		if (!detail) throw new AppError("Job not found", "NOT_FOUND", 404);
		return { ...detail, ...jobItem(detail, queue) };
	}

	async retry(queue: CrawlerQueueName, id: string): Promise<{ ok: true }> {
		const detail = await this.detail(queue, id);
		if (detail.state !== "failed")
			throw new AppError("Only failed jobs can be retried", "VALIDATION_ERROR", 409);
		if (!(await this.queues[queue].retryJob(id)))
			throw new AppError("Job not found", "NOT_FOUND", 404);
		return { ok: true };
	}

	async remove(queue: CrawlerQueueName, id: string): Promise<{ ok: true }> {
		const detail = await this.detail(queue, id);
		if (detail.state === "active")
			throw new AppError("Active jobs cannot be removed", "VALIDATION_ERROR", 409);
		if (!(await this.queues[queue].removeJob(id)))
			throw new AppError("Job not found", "NOT_FOUND", 404);
		return { ok: true };
	}
}
