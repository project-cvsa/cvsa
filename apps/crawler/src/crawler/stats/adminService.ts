import { z } from "zod";
import {
	AppError,
	CrawlerStatsExportStateSchema,
	CrawlerStatsModelStateSchema,
	CrawlerStatsQueueStateSchema,
	CrawlerStatsResourceStateSchema,
	CrawlerStatsTrackingStateSchema,
	CrawlerStrategyStatusSchema,
	CRAWLER_STATS_FORMAT_VERSION,
	type CrawlerOverviewStats,
	type CrawlerQueueJobDetail,
	type CrawlerQueueJobItem,
	type CrawlerQueueJobsQuery,
	type CrawlerQueueJobsResponse,
	type CrawlerQueueName,
	type CrawlerStatsQuery,
	type CrawlerStatsQueueState,
	type CrawlerStrategyStatus,
	type CrawlerStatsModelState,
	type CrawlerStatsResourceState,
	type CrawlerStatsExportState,
	type CrawlerStatsTrackingState,
} from "@cvsa/contracts";
import type { JobType } from "bullmq";
import type { CrawlerQueue, CrawlerJobCounts } from "../shared/types";
import type { CrawlerStatsCollector } from "./collector";
import {
	computeRatios,
	distributionSummariesForPrefix,
	ratioInputs as ratioInputsOf,
	summarizeLatency,
} from "./aggregation";
import type {
	StatsExportState,
	StatsModelState,
	StatsOverviewDeps,
	StatsQueueSnapshot,
	StatsResourceState,
	StatsStrategyState,
	StatsTrackingState,
} from "./types";
import type { CrawlerStatsStateRepository } from "./stateRepository";
import { readQueues } from "./queueState";

function jobItem(
	job: import("../shared/types").CrawlerQueueJobSnapshot,
	queue: CrawlerQueueName
): CrawlerQueueJobItem {
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

function readState<T>(
	row: { status: string; data: unknown } | undefined,
	schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }
): T | null {
	if (row?.status !== "success") return null;
	const parsed = schema.safeParse(row.data);
	return parsed.success ? parsed.data : null;
}

function queueState(counts: StatsQueueSnapshot): CrawlerStatsQueueState {
	return {
		waiting: counts.waiting,
		prioritized: counts.prioritized,
		active: counts.active,
		delayed: counts.delayed,
		failed: counts.failed,
		completed: counts.completed,
		oldestWaitSec: counts.oldestWaitSec,
		activeAgeSec: counts.activeAgeSec,
	};
}

function modelState(state: StatsModelState): CrawlerStatsModelState {
	return {
		reachable: state.reachable,
		modelsLoaded: state.modelsLoaded,
		modelVersion: state.modelVersion,
		activeRequests: state.activeRequests,
		waitingRequests: state.waitingRequests,
		loadFailures: state.loadFailures,
		starts: state.starts,
		exits: state.exits,
		timeoutTerminations: state.timeoutTerminations,
		cancelTerminations: state.cancelTerminations,
	};
}

function resourceState(state: StatsResourceState | null): CrawlerStatsResourceState | null {
	if (!state) return null;
	return {
		sampledAt: state.sampledAt,
		processes: state.processes.map((process) => ({
			id: process.id,
			role: process.role,
			cpuPercent: process.cpuPercent,
			rssBytes: process.rssBytes,
		})),
		eventLoopDelayMs: state.eventLoopDelayMs,
	};
}

function exportState(state: StatsExportState | null): CrawlerStatsExportState {
	return (
		state ?? {
			enabled: false,
			successes: 0,
			failures: 0,
			lastSuccessAt: null,
			durationMs: null,
			lastResult: "not_exported",
			lastError: null,
		}
	);
}

function strategyState(state: StatsStrategyState): CrawlerStrategyStatus {
	return state;
}

function trackingState(state: StatsTrackingState | null): CrawlerStatsTrackingState {
	return (
		state ?? {
			total: 0,
			byState: {},
			byPriority: {},
			neverCaptured: 0,
			freshness: { count: 0, meanSec: null, quantilesSec: {}, maxSec: null },
			freshnessByState: {},
			freshnessByPriority: {},
			dueNow: 0,
			metadataDue: 0,
			maxOverdueLagSec: 0,
		}
	);
}

export class CrawlerAdminStatsService {
	constructor(
		private readonly queues: Record<CrawlerQueueName, CrawlerQueue<unknown>>,
		private readonly collector: CrawlerStatsCollector,
		private readonly deps: StatsOverviewDeps = {},
		private readonly stateRepository?: CrawlerStatsStateRepository
	) {}

	async overview(query: CrawlerStatsQuery): Promise<CrawlerOverviewStats> {
		const { window, minutes } = query;
		const quantiles = query.quantiles
			?.split(",")
			.map(Number)
			.filter((value) => Number.isFinite(value) && value > 0 && value <= 1);
		const report = await this.collector.getReport(
			window,
			minutes,
			quantiles && quantiles.length > 0 ? quantiles : undefined
		);
		const latest = report.latestStates;
		const [liveQueues, labeling, videoCoverage, modelVersions] = await Promise.all([
			this.deps.queueCounts?.() ??
				(async () => {
					const sampled = readState(
						latest.get("queues"),
						z.record(z.string(), CrawlerStatsQueueStateSchema)
					);
					return sampled ?? readQueues(this.queues);
				})(),
			this.deps.labeling?.(report.from, report.to) ??
				this.stateRepository?.labelingState(report.from, report.to) ??
				Promise.resolve({
					samples: 0,
					truePositive: 0,
					falsePositive: 0,
					trueNegative: 0,
					falseNegative: 0,
					accuracy: null,
					precision: null,
					recall: null,
				}),
			this.deps.videoCoverage?.(report.from, report.to) ??
				this.stateRepository?.videoCoverage(report.from, report.to).catch(() => null) ??
				Promise.resolve(null),
			this.stateRepository
				?.discoveryModelVersions(report.from, report.to)
				.catch(() => ({})) ?? Promise.resolve({}),
		]);
		const [currentTracking, currentModel, currentResources, currentExport, currentStrategies] =
			await Promise.all([
				this.deps.trackingState?.(report.to) ??
					Promise.resolve(
						readState(latest.get("tracking"), CrawlerStatsTrackingStateSchema)
					),
				this.deps.modelState?.() ??
					Promise.resolve(readState(latest.get("model"), CrawlerStatsModelStateSchema)),
				this.deps.resourceState?.() ??
					Promise.resolve(
						readState(latest.get("resources"), CrawlerStatsResourceStateSchema)
					),
				this.deps.exportState?.() ??
					Promise.resolve(readState(latest.get("export"), CrawlerStatsExportStateSchema)),
				this.deps.strategies?.() ??
					Promise.resolve(
						readState(latest.get("strategies"), z.array(CrawlerStrategyStatusSchema)) ??
							[]
					),
			]);
		const sampledAt = [...latest.values()]
			.map((row) => row.sampledAt.epochMilliseconds)
			.sort((a, b) => b - a)[0];
		const ratios = computeRatios(report.minutes);
		const latency = summarizeLatency(report.minutes);
		return {
			version: CRAWLER_STATS_FORMAT_VERSION,
			window,
			minutes,
			generatedAt: new Date().toISOString(),
			range: {
				from: new Date(report.from).toISOString(),
				to: new Date(report.to).toISOString(),
				seconds: (report.to - report.from) / 1000,
			},
			coverage: {
				...report.coverage,
				unavailableMetrics: report.availability
					.filter((row) => row.enabledAt.epochMilliseconds > report.from)
					.map((row) => row.metric),
			},
			counters: report.minutes.counters,
			jobs: report.minutes.jobs,
			network: report.minutes.network,
			ratios,
			ratioInputs: ratioInputsOf(report.minutes),
			latency,
			persistence: report.persistence,
			instances: report.instances.map((instance) => ({
				instanceId: instance.instanceId,
				startedAt: new Date(instance.startedAt).toISOString(),
				exitedAt:
					instance.exitedAt === null ? null : new Date(instance.exitedAt).toISOString(),
				lastPersistedAt: new Date(instance.lastPersistedAt).toISOString(),
				coveredTo: new Date(instance.coveredTo).toISOString(),
				heartbeatAt:
					instance.heartbeatAt === null
						? null
						: new Date(instance.heartbeatAt).toISOString(),
				active:
					instance.exitedAt === null &&
					(instance.heartbeatAt === null || Date.now() - instance.heartbeatAt < 30_000),
			})),
			current: {
				sampledAt: sampledAt === undefined ? null : new Date(sampledAt).toISOString(),
				stale: sampledAt === undefined || Date.now() - sampledAt > 60_000,
				queues: Object.fromEntries(
					Object.entries(liveQueues).map(([name, counts]) => [name, queueState(counts)])
				),
				tracking: trackingState(currentTracking),
				model: modelState(
					currentModel ?? {
						reachable: null,
						modelsLoaded: null,
						modelVersion: null,
						activeRequests: 0,
						waitingRequests: 0,
						loadFailures: 0,
						starts: 0,
						exits: 0,
						timeoutTerminations: 0,
						cancelTerminations: 0,
					}
				),
				resources: resourceState(currentResources),
				export: exportState(currentExport),
				strategies: currentStrategies.map(strategyState),
			},
			discovery: {
				byChannel: report.minutes.discovery,
				byReason: report.minutes.discoveryReasons,
				byModelVersion: modelVersions,
			},
			labeling,
			videoCoverage,
			database: {
				byOperation: report.minutes.database,
				durationMs: distributionSummariesForPrefix(
					report.minutes.distributions,
					"databaseOperation"
				),
			},
			redis: {
				byCommand: report.minutes.redis,
				durationMs: distributionSummariesForPrefix(
					report.minutes.distributions,
					"redisOperation"
				),
			},
			series: report.series,
			legacy: report.legacy
				? {
						window,
						from: new Date(report.legacy.from).toISOString(),
						to: new Date(report.legacy.to).toISOString(),
						counters: report.legacy.counters,
						errors: report.legacy.errors,
						latencyP95Ms: report.legacy.latencyP95Ms,
					}
				: null,
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
		const windowSize = (query.offset ?? 0) + query.limit;
		const rows: Array<{
			queue: CrawlerQueueName;
			job: import("../shared/types").CrawlerQueueJobSnapshot;
		}> = [];
		for (const name of names) {
			for (const state of states) {
				const types: JobType[] = state === "waiting" ? ["waiting", "prioritized"] : [state];
				const jobs = await this.queues[name].getJobs(types, windowSize, 0);
				for (const job of jobs) rows.push({ queue: name, job });
			}
		}
		const sorted = rows
			.sort(
				(a, b) =>
					a.job.timestamp - b.job.timestamp ||
					a.queue.localeCompare(b.queue) ||
					a.job.id.localeCompare(b.job.id)
			)
			.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit)
			.map((row) => jobItem(row.job, row.queue));
		return { items: sorted, total };
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
