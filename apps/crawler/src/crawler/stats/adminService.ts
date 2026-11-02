import { derivedMetrics } from "./aggregation";
import {
	AppError,
	type CrawlerOverviewStats,
	type CrawlerQueueJobDetail,
	type CrawlerQueueJobItem,
	type CrawlerQueueJobsResponse,
	type CrawlerQueueJobsQuery,
	type CrawlerQueueSnapshot,
	type CrawlerQueueName,
	type CrawlerStatsQuery,
} from "@cvsa/contracts";
import type { JobType } from "bullmq";
import type { CrawlerQueue, CrawlerJobCounts, CrawlerQueueJobSnapshot } from "../shared/types";
import type { CrawlerStatsCollector } from "./collector";
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
	const [tracking, discovery] = await Promise.all([
		readQueue(snapshotQueue),
		readQueue(discoveryQueue),
	]);
	return { tracking, discovery };
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

		const [overview, queues] = await Promise.all([
			this.collector.getReport(window, minutes),
			readQueues(this.queues.tracking, this.queues.discovery),
		]);

		const counters = overview.metrics.counters;
		const errors = overview.metrics.errors;
		const derived = derivedMetrics(overview.metrics);

		return {
			window,
			minutes,
			generatedAt: overview.generatedAt,
			coverageFrom: new Date(overview.metrics.from).toISOString(),
			coverageSeconds: (overview.metrics.to - overview.metrics.from) / 1000,
			counters,
			jobs: overview.metrics.jobs,
			network: overview.metrics.network,
			...derived,
			snapshotsSaved: counters.snapshotsSaved,
			videosDiscovered: counters.videosDiscovered,
			totalAttempts: counters.networkRequests,
			totalFailures: Object.values(errors).reduce((sum, n) => sum + n, 0),
			breakdown: errors,
			overdueTrackingCount: overview.tracking.overdueCount,
			maxOverdueLagSec: overview.tracking.maxOverdueLagSec,
			queues,
			latencyMs: {
				taskP95: overview.metrics.latencyP95Ms.task,
				apiP95: overview.metrics.latencyP95Ms.api,
				inferenceP95: overview.metrics.latencyP95Ms.inference,
			},
			series: overview.series,
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
