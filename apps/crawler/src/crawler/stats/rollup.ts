import type { DatabaseClient, Temporal } from "@cvsa/snapshot-db";
import { toJson } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type { OverdueTrackingSummary } from "../tracking/repository.interface";
import {
	emptyCounters,
	emptyErrors,
	emptyLatencyP95,
	STATS_COUNTERS,
	STATS_ERROR_KINDS,
	STATS_LATENCY_KINDS,
	type StatsCounters,
	type StatsErrors,
	type StatsLatencyP95,
	type StatsQueueSnapshot,
	type StatsRollupMetrics,
} from "./types";

export interface SaveStatsRollupInput {
	bucketTime: Temporal.Instant;
	metricGroup: string;
	metrics: StatsRollupMetrics;
}

export interface StatsRollupRow {
	bucketTime: Temporal.Instant;
	metricGroup: string;
	metrics: StatsRollupMetrics | null;
}

/**
 * Persistence contract for the rollup table.
 *
 * The collector depends on this interface rather than on
 * {@link CrawlerStatsRepository} so the sliding-window logic can be tested (and
 * backed by anything) without a database.
 */
export interface StatsRollupStore {
	saveRollup(input: SaveStatsRollupInput): Promise<void>;
	listRollup(
		metricGroup: string,
		since: Temporal.Instant,
		limit?: number
	): Promise<StatsRollupRow[]>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return Object.fromEntries(Object.entries(value));
}

function readNumber(source: Record<string, unknown>, key: string): number {
	const value = source[key];
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
		return Number(value);
	}
	return 0;
}

function readCounters(value: unknown): StatsCounters {
	const source = asRecord(value) ?? {};
	const counters = emptyCounters();
	for (const key of STATS_COUNTERS) counters[key] = readNumber(source, key);
	return counters;
}

function readErrors(value: unknown): StatsErrors {
	const source = asRecord(value) ?? {};
	const errors = emptyErrors();
	for (const key of STATS_ERROR_KINDS) errors[key] = readNumber(source, key);
	return errors;
}

function readLatency(value: unknown): StatsLatencyP95 {
	const source = asRecord(value) ?? {};
	const latency = emptyLatencyP95();
	for (const key of STATS_LATENCY_KINDS) latency[key] = readNumber(source, key);
	return latency;
}

function readQueue(value: unknown): StatsQueueSnapshot | undefined {
	const source = asRecord(value);
	if (!source) return undefined;
	const snapshot: StatsQueueSnapshot = {
		waiting: readNumber(source, "waiting"),
		active: readNumber(source, "active"),
		delayed: readNumber(source, "delayed"),
		failed: readNumber(source, "failed"),
		completed: readNumber(source, "completed"),
		inFlight: 0,
	};
	snapshot.inFlight = snapshot.active + snapshot.waiting;
	return snapshot;
}

function readTracking(value: unknown): OverdueTrackingSummary | undefined {
	const source = asRecord(value);
	if (!source) return undefined;
	return {
		overdueCount: readNumber(source, "overdueCount"),
		maxOverdueLagSec: readNumber(source, "maxOverdueLagSec"),
	};
}

/**
 * Rebuild a typed metrics document from the JSON column.
 *
 * Rollup rows are read back by the admin console, so a partially-written or
 * older-schema document must degrade to zeros instead of throwing mid-render.
 */
function parseMetrics(value: unknown): StatsRollupMetrics | null {
	const source = asRecord(value);
	if (!source) return null;

	const queue = readQueue(source.queue);
	const tracking = readTracking(source.tracking);

	return {
		counters: readCounters(source.counters),
		errors: readErrors(source.errors),
		retries: readNumber(source, "retries"),
		latencyP95Ms: readLatency(source.latencyP95Ms),
		...(queue ? { queue } : {}),
		...(tracking ? { tracking } : {}),
	};
}

/** Prisma-backed persistence for `crawler_stats_rollup`. */
export class CrawlerStatsRepository implements StatsRollupStore {
	constructor(private readonly db: DatabaseClient) {}

	async saveRollup(input: SaveStatsRollupInput): Promise<void> {
		await traceTask("stats.saveRollup", async () => {
			const metrics = toJson(input.metrics);
			await this.db.orm.public.CrawlerStatsRollup.upsert({
				create: {
					bucketTime: input.bucketTime,
					metricGroup: input.metricGroup,
					metrics,
				},
				update: { metrics },
				conflictOn: {
					bucketTime: input.bucketTime,
					metricGroup: input.metricGroup,
				},
			});
		});
	}

	async listRollup(
		metricGroup: string,
		since: Temporal.Instant,
		limit = 240
	): Promise<StatsRollupRow[]> {
		return traceTask("stats.listRollup", async () => {
			const rows = await this.db.orm.public.CrawlerStatsRollup.where((row) =>
				row.metricGroup.eq(metricGroup)
			)
				.orderBy((row) => row.bucketTime.desc())
				.limit(Math.min(Math.max(limit, 1), 2_000))
				.all();

			return rows
				.filter((row) => row.bucketTime.epochMilliseconds >= since.epochMilliseconds)
				.map((row) => ({
					bucketTime: row.bucketTime,
					metricGroup: row.metricGroup,
					metrics: parseMetrics(row.metrics),
				}))
				.reverse();
		});
	}
}
