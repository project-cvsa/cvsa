import { and, count, desc, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
	discoverySample,
	toInstant,
	latestVideoSnapshot,
	videoTracking,
	type DatabaseClient,
} from "@cvsa/snapshot-db";
import type { StatsLabelingState, StatsTrackingState } from "./types";

const COVERAGE_CACHE_MS = 60_000;
const RANGE_AGG_CACHE_MS = 30_000;

type GroupingSetRow = {
	grp: number;
	state: string | null;
	priority: number | null;
	total: number;
	never_captured: number;
	fresh_count: number;
	mean_sec: number | string | null;
	max_sec: number | string | null;
	quantiles: Array<number | string | null> | string | null;
};

function parsePgFloatArray(value: Array<number | string | null> | string | null): number[] {
	if (Array.isArray(value)) {
		return value.map((item) => (item == null ? Number.NaN : Number(item)));
	}
	if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
		const inner = value.slice(1, -1).trim();
		if (inner.length === 0) return [];
		return inner.split(",").map((part) => (part === "NULL" ? Number.NaN : Number(part)));
	}
	return [];
}

function freshnessOf(row: GroupingSetRow | undefined): StatsTrackingState["freshness"] {
	const quantiles = row ? parsePgFloatArray(row.quantiles) : [];
	const q = (idx: number): number | null => {
		const val = quantiles[idx];
		return val !== undefined && Number.isFinite(val) ? val : null;
	};
	return {
		count: Number(row?.fresh_count ?? 0),
		meanSec: row?.mean_sec == null ? null : Number(row.mean_sec),
		quantilesSec: {
			"0.5": q(0),
			"0.9": q(1),
			"0.95": q(2),
			"0.99": q(3),
		},
		maxSec: row?.max_sec == null ? null : Number(row.max_sec),
	};
}

export class CrawlerStatsStateRepository {
	private coverageCache: { key: string; expiresAt: number; value: number } | undefined;
	private labelingCache:
		| { key: string; expiresAt: number; value: StatsLabelingState }
		| undefined;
	private modelVersionsCache:
		| { key: string; expiresAt: number; value: Record<string, number> }
		| undefined;

	constructor(
		private readonly db: DatabaseClient,
		private readonly now: () => number = Date.now
	) {}

	async trackingState(now = this.now()): Promise<StatsTrackingState> {
		const at = toInstant(new Date(now));
		const [groupingRows, dueRows, metadataRows] = await Promise.all([
			this.db.execute<GroupingSetRow>(sql`
				SELECT
					grouping(state, priority)::int AS grp,
					state,
					priority,
					count(*)::int AS total,
					count(*) FILTER (WHERE last_captured_at IS NULL)::int AS never_captured,
					count(last_captured_at)::int AS fresh_count,
					avg(extract(epoch FROM now() - last_captured_at))::float8 AS mean_sec,
					max(extract(epoch FROM now() - last_captured_at))::float8 AS max_sec,
					percentile_cont(ARRAY[0.5, 0.9, 0.95, 0.99]) WITHIN GROUP (
						ORDER BY extract(epoch FROM now() - last_captured_at)
					) AS quantiles
				FROM video_tracking
				GROUP BY GROUPING SETS ((), (state), (priority))
			`),
			this.db
				.select({
					dueNow: sql<number>`count(*)::int`,
					maxLagSec: sql<
						number | null
					>`max(extract(epoch from now() - ${videoTracking.nextSnapshotAt}))`,
				})
				.from(videoTracking)
				.where(
					and(
						lte(videoTracking.nextSnapshotAt, at),
						or(isNull(videoTracking.leaseUntil), lte(videoTracking.leaseUntil, at))
					)
				),
			this.db
				.select({ metadataDue: sql<number>`count(*)::int` })
				.from(videoTracking)
				.where(lte(videoTracking.nextMetadataAt, at)),
		]);

		// grouping(state, priority) bitmask:
		// 3 (11b) = (), 1 (01b) = (state), 2 (10b) = (priority)
		let summary: GroupingSetRow | undefined;
		const byState: Record<string, number> = {};
		const byPriority: Record<string, number> = {};
		const freshnessByState: Record<string, StatsTrackingState["freshness"]> = {};
		const freshnessByPriority: Record<string, StatsTrackingState["freshness"]> = {};

		for (const row of groupingRows) {
			const grp = Number(row.grp);
			if (grp === 3) {
				summary = row;
			} else if (grp === 1 && row.state !== null) {
				byState[row.state] = Number(row.total);
				freshnessByState[row.state] = freshnessOf(row);
			} else if (grp === 2 && row.priority !== null) {
				const key = String(row.priority);
				byPriority[key] = Number(row.total);
				freshnessByPriority[key] = freshnessOf(row);
			}
		}

		return {
			total: Number(summary?.total ?? 0),
			byState,
			byPriority,
			neverCaptured: Number(summary?.never_captured ?? 0),
			freshness: freshnessOf(summary),
			freshnessByState,
			freshnessByPriority,
			dueNow: dueRows[0]?.dueNow ?? 0,
			metadataDue: metadataRows[0]?.metadataDue ?? 0,
			maxOverdueLagSec:
				dueRows[0]?.maxLagSec == null ? 0 : Math.max(0, Number(dueRows[0].maxLagSec)),
		};
	}

	async labelingState(from: number, to: number): Promise<StatsLabelingState> {
		const key = `${from}:${to}`;
		const now = this.now();
		if (
			this.labelingCache &&
			this.labelingCache.key === key &&
			this.labelingCache.expiresAt > now
		) {
			return this.labelingCache.value;
		}
		const [row] = await this.db
			.select({
				samples: sql<number>`count(*)::int`,
				truePositive: sql<number>`count(*) filter (where ${discoverySample.humanLabel} = 1 and ${discoverySample.decision} = 'accepted')::int`,
				falsePositive: sql<number>`count(*) filter (where ${discoverySample.humanLabel} = 0 and ${discoverySample.decision} = 'accepted')::int`,
				trueNegative: sql<number>`count(*) filter (where ${discoverySample.humanLabel} = 0 and ${discoverySample.decision} = 'rejected')::int`,
				falseNegative: sql<number>`count(*) filter (where ${discoverySample.humanLabel} = 1 and ${discoverySample.decision} = 'rejected')::int`,
			})
			.from(discoverySample)
			.where(
				and(
					gte(discoverySample.labeledAt, toInstant(new Date(from))),
					lt(discoverySample.labeledAt, toInstant(new Date(to)))
				)
			);
		const samples = row?.samples ?? 0;
		const tp = row?.truePositive ?? 0;
		const fp = row?.falsePositive ?? 0;
		const tn = row?.trueNegative ?? 0;
		const fn = row?.falseNegative ?? 0;
		const value: StatsLabelingState = {
			samples,
			truePositive: tp,
			falsePositive: fp,
			trueNegative: tn,
			falseNegative: fn,
			accuracy: samples > 0 ? (tp + tn) / samples : null,
			precision: tp + fp > 0 ? tp / (tp + fp) : null,
			recall: tp + fn > 0 ? tp / (tp + fn) : null,
		};
		this.labelingCache = { key, expiresAt: now + RANGE_AGG_CACHE_MS, value };
		return value;
	}

	async videoCoverage(from: number, to: number): Promise<number> {
		const key = `${from}:${to}`;
		const now = this.now();
		if (
			this.coverageCache &&
			this.coverageCache.key === key &&
			this.coverageCache.expiresAt > now
		)
			return this.coverageCache.value;
		const [row] = await this.db
			.select({ videos: sql<number>`count(*)::int` })
			.from(latestVideoSnapshot)
			.where(
				and(
					gte(latestVideoSnapshot.capturedAt, toInstant(new Date(from))),
					lt(latestVideoSnapshot.capturedAt, toInstant(new Date(to)))
				)
			);
		const value = row?.videos ?? 0;
		this.coverageCache = { key, expiresAt: now + COVERAGE_CACHE_MS, value };
		return value;
	}

	async discoveryModelVersions(from: number, to: number): Promise<Record<string, number>> {
		const key = `${from}:${to}`;
		const now = this.now();
		if (
			this.modelVersionsCache &&
			this.modelVersionsCache.key === key &&
			this.modelVersionsCache.expiresAt > now
		) {
			return this.modelVersionsCache.value;
		}
		const rows = await this.db
			.select({ version: discoverySample.modelVersion, total: count() })
			.from(discoverySample)
			.where(
				and(
					gte(discoverySample.createdAt, toInstant(new Date(from))),
					lt(discoverySample.createdAt, toInstant(new Date(to)))
				)
			)
			.groupBy(discoverySample.modelVersion);
		const value = Object.fromEntries(rows.map((row) => [row.version, row.total]));
		this.modelVersionsCache = { key, expiresAt: now + RANGE_AGG_CACHE_MS, value };
		return value;
	}

	async latestDiscoverySamples(limit = 20) {
		return this.db
			.select()
			.from(discoverySample)
			.orderBy(desc(discoverySample.createdAt))
			.limit(limit);
	}
}
