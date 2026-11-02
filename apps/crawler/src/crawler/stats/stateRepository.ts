import { and, count, desc, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
	discoverySample,
	toInstant,
	videoSnapshot,
	videoTracking,
	type DatabaseClient,
} from "@cvsa/snapshot-db";
import type { StatsLabelingState, StatsTrackingState } from "./types";

const COVERAGE_CACHE_MS = 60_000;

type FreshnessRow = {
	freshCount: number;
	meanSec: number | null;
	maxSec: number | null;
	p50: number | null;
	p90: number | null;
	p95: number | null;
	p99: number | null;
};

function freshnessOf(row: FreshnessRow | undefined): StatsTrackingState["freshness"] {
	return {
		count: row?.freshCount ?? 0,
		meanSec: row?.meanSec == null ? null : Number(row.meanSec),
		quantilesSec: {
			"0.5": row?.p50 == null ? null : Number(row.p50),
			"0.9": row?.p90 == null ? null : Number(row.p90),
			"0.95": row?.p95 == null ? null : Number(row.p95),
			"0.99": row?.p99 == null ? null : Number(row.p99),
		},
		maxSec: row?.maxSec == null ? null : Number(row.maxSec),
	};
}

export class CrawlerStatsStateRepository {
	private coverageCache: { key: string; expiresAt: number; value: number } | undefined;

	constructor(
		private readonly db: DatabaseClient,
		private readonly now: () => number = Date.now
	) {}

	async trackingState(now = this.now()): Promise<StatsTrackingState> {
		const at = toInstant(new Date(now));
		const [
			stateRows,
			priorityRows,
			summaryRows,
			stateFreshnessRows,
			priorityFreshnessRows,
			dueRows,
			metadataRows,
		] = await Promise.all([
			this.db
				.select({ state: videoTracking.state, total: count() })
				.from(videoTracking)
				.groupBy(videoTracking.state),
			this.db
				.select({ priority: videoTracking.priority, total: count() })
				.from(videoTracking)
				.groupBy(videoTracking.priority),
			this.db
				.select({
					total: sql<number>`count(*)::int`,
					neverCaptured: sql<number>`count(*) filter (where ${videoTracking.lastCapturedAt} is null)::int`,
					freshCount: sql<number>`count(${videoTracking.lastCapturedAt})::int`,
					meanSec: sql<
						number | null
					>`avg(extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					maxSec: sql<
						number | null
					>`max(extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p50: sql<
						number | null
					>`percentile_cont(0.5) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p90: sql<
						number | null
					>`percentile_cont(0.9) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p95: sql<
						number | null
					>`percentile_cont(0.95) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p99: sql<
						number | null
					>`percentile_cont(0.99) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
				})
				.from(videoTracking),
			this.db
				.select({
					group: videoTracking.state,
					freshCount: sql<number>`count(${videoTracking.lastCapturedAt})::int`,
					meanSec: sql<
						number | null
					>`avg(extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					maxSec: sql<
						number | null
					>`max(extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p50: sql<
						number | null
					>`percentile_cont(0.5) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p90: sql<
						number | null
					>`percentile_cont(0.9) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p95: sql<
						number | null
					>`percentile_cont(0.95) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p99: sql<
						number | null
					>`percentile_cont(0.99) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
				})
				.from(videoTracking)
				.groupBy(videoTracking.state),
			this.db
				.select({
					group: videoTracking.priority,
					freshCount: sql<number>`count(${videoTracking.lastCapturedAt})::int`,
					meanSec: sql<
						number | null
					>`avg(extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					maxSec: sql<
						number | null
					>`max(extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p50: sql<
						number | null
					>`percentile_cont(0.5) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p90: sql<
						number | null
					>`percentile_cont(0.9) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p95: sql<
						number | null
					>`percentile_cont(0.95) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
					p99: sql<
						number | null
					>`percentile_cont(0.99) within group (order by extract(epoch from now() - ${videoTracking.lastCapturedAt}))`,
				})
				.from(videoTracking)
				.groupBy(videoTracking.priority),
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
		const summary = summaryRows[0];
		return {
			total: summary?.total ?? 0,
			byState: Object.fromEntries(stateRows.map((row) => [row.state, row.total])),
			byPriority: Object.fromEntries(
				priorityRows.map((row) => [String(row.priority), row.total])
			),
			neverCaptured: summary?.neverCaptured ?? 0,
			freshness: freshnessOf(summary),
			freshnessByState: Object.fromEntries(
				stateFreshnessRows.map((row) => [row.group, freshnessOf(row)])
			),
			freshnessByPriority: Object.fromEntries(
				priorityFreshnessRows.map((row) => [String(row.group), freshnessOf(row)])
			),
			dueNow: dueRows[0]?.dueNow ?? 0,
			metadataDue: metadataRows[0]?.metadataDue ?? 0,
			maxOverdueLagSec:
				dueRows[0]?.maxLagSec == null ? 0 : Math.max(0, Number(dueRows[0].maxLagSec)),
		};
	}

	async labelingState(from: number, to: number): Promise<StatsLabelingState> {
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
		return {
			samples,
			truePositive: tp,
			falsePositive: fp,
			trueNegative: tn,
			falseNegative: fn,
			accuracy: samples > 0 ? (tp + tn) / samples : null,
			precision: tp + fp > 0 ? tp / (tp + fp) : null,
			recall: tp + fn > 0 ? tp / (tp + fn) : null,
		};
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
			.select({ videos: sql<number>`count(distinct ${videoSnapshot.aid})::int` })
			.from(videoSnapshot)
			.where(
				and(
					gte(videoSnapshot.capturedAt, toInstant(new Date(from))),
					lt(videoSnapshot.capturedAt, toInstant(new Date(to)))
				)
			);
		const value = row?.videos ?? 0;
		this.coverageCache = { key, expiresAt: now + COVERAGE_CACHE_MS, value };
		return value;
	}

	async discoveryModelVersions(from: number, to: number): Promise<Record<string, number>> {
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
		return Object.fromEntries(rows.map((row) => [row.version, row.total]));
	}

	async latestDiscoverySamples(limit = 20) {
		return this.db
			.select()
			.from(discoverySample)
			.orderBy(desc(discoverySample.createdAt))
			.limit(limit);
	}
}
