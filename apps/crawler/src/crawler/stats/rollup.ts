import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import {
	CRAWLER_STATS_FORMAT_VERSION,
	CrawlerStatsMinuteSchema,
	CrawlerStatsMinuteV2Schema,
	type CrawlerStatsMinute,
	type CrawlerStatsMinuteV2,
} from "@cvsa/contracts";
import {
	crawlerStatsHour,
	crawlerStatsHourPending,
	crawlerStatsInstance,
	crawlerStatsMetricAvailability,
	crawlerStatsMinute,
	crawlerStatsState,
	toInstant,
	type DatabaseClient,
	type Temporal,
} from "@cvsa/snapshot-db";

export interface SaveStatsMinuteInput {
	sourceId: string;
	bucketTime: Temporal.Instant;
	metrics: CrawlerStatsMinuteV2;
	/** Updated in the same transaction as the minute row. */
	instance?: StatsInstanceRow;
}

export interface StatsMinuteRow {
	sourceId: string;
	bucketTime: Temporal.Instant;
	metrics: CrawlerStatsMinuteV2;
}

export interface StatsLegacyMinuteRow {
	sourceId: string;
	bucketTime: Temporal.Instant;
	metrics: CrawlerStatsMinute;
}

export interface StatsInstanceRow {
	instanceId: string;
	startedAt: Temporal.Instant;
	exitedAt: Temporal.Instant | null;
	lastPersistedAt: Temporal.Instant;
	coveredTo: Temporal.Instant;
	formatVersion: number;
}

export interface StatsHourRow {
	hourTime: Temporal.Instant;
	sourceId: string;
	metrics: CrawlerStatsMinuteV2;
}

export interface StatsStateRow {
	sampledAt: Temporal.Instant;
	scope: string;
	item: string;
	status: string;
	data: unknown;
}

export interface StatsHourPendingRow {
	hourTime: Temporal.Instant;
	sourceId: string;
	generation: number;
}

export interface StatsRangeData {
	minutes: StatsMinuteRow[];
	legacy: StatsLegacyMinuteRow[];
	instances: StatsInstanceRow[];
	states: StatsStateRow[];
	hours: StatsHourRow[];
	pendingHours: StatsHourPendingRow[];
	availability: Array<{ metric: string; enabledAt: Temporal.Instant }>;
}

const HOUR_MS = 3_600_000;

function isV2(value: unknown): value is CrawlerStatsMinuteV2 {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { version?: unknown }).version === CRAWLER_STATS_FORMAT_VERSION
	);
}

export class CrawlerStatsRepository {
	constructor(private readonly db: DatabaseClient) {}

	async saveMinute(input: SaveStatsMinuteInput): Promise<void> {
		const metrics = input.metrics;
		await this.db.transaction(async (tx) => {
			await tx
				.insert(crawlerStatsMinute)
				.values({ sourceId: input.sourceId, bucketTime: input.bucketTime, metrics })
				.onConflictDoUpdate({
					target: [crawlerStatsMinute.bucketTime, crawlerStatsMinute.sourceId],
					set: { metrics },
				});
			const hour =
				input.bucketTime.epochMilliseconds - (input.bucketTime.epochMilliseconds % HOUR_MS);
			if (input.instance) {
				const instance = input.instance;
				await tx
					.insert(crawlerStatsInstance)
					.values(instance)
					.onConflictDoUpdate({
						target: crawlerStatsInstance.instanceId,
						set: {
							startedAt: instance.startedAt,
							exitedAt: instance.exitedAt,
							lastPersistedAt: instance.lastPersistedAt,
							coveredTo: instance.coveredTo,
							formatVersion: instance.formatVersion,
						},
					});
			}
			await tx
				.insert(crawlerStatsHourPending)
				.values({
					hourTime: toInstant(new Date(hour)),
					sourceId: input.sourceId,
					generation: 1,
					updatedAt: input.bucketTime,
				})
				.onConflictDoUpdate({
					target: [crawlerStatsHourPending.hourTime, crawlerStatsHourPending.sourceId],
					set: {
						generation: sql`${crawlerStatsHourPending.generation} + 1`,
						updatedAt: input.bucketTime,
					},
				});
		});
	}

	async listMinutes(from: Temporal.Instant, to: Temporal.Instant): Promise<StatsMinuteRow[]> {
		const rows = await this.db
			.select()
			.from(crawlerStatsMinute)
			.where(
				and(gte(crawlerStatsMinute.bucketTime, from), lt(crawlerStatsMinute.bucketTime, to))
			)
			.orderBy(asc(crawlerStatsMinute.bucketTime));
		return rows.flatMap((row) => {
			if (!isV2(row.metrics)) return [];
			return [
				{
					sourceId: row.sourceId,
					bucketTime: row.bucketTime,
					metrics: CrawlerStatsMinuteV2Schema.parse(row.metrics),
				},
			];
		});
	}

	async listLegacyMinutes(
		from: Temporal.Instant,
		to: Temporal.Instant
	): Promise<StatsLegacyMinuteRow[]> {
		const rows = await this.db
			.select()
			.from(crawlerStatsMinute)
			.where(
				and(gte(crawlerStatsMinute.bucketTime, from), lt(crawlerStatsMinute.bucketTime, to))
			)
			.orderBy(asc(crawlerStatsMinute.bucketTime));
		return rows.flatMap((row) => {
			if (isV2(row.metrics)) return [];
			const parsed = CrawlerStatsMinuteSchema.safeParse(row.metrics);
			if (!parsed.success) return [];
			return [
				{
					sourceId: row.sourceId,
					bucketTime: row.bucketTime,
					metrics: parsed.data,
				},
			];
		});
	}

	async upsertInstance(row: StatsInstanceRow): Promise<void> {
		await this.db
			.insert(crawlerStatsInstance)
			.values(row)
			.onConflictDoUpdate({
				target: crawlerStatsInstance.instanceId,
				set: {
					startedAt: row.startedAt,
					exitedAt: row.exitedAt,
					lastPersistedAt: row.lastPersistedAt,
					coveredTo: row.coveredTo,
					formatVersion: row.formatVersion,
				},
			});
	}

	async listInstances(from: Temporal.Instant, to: Temporal.Instant): Promise<StatsInstanceRow[]> {
		const rows = await this.db
			.select()
			.from(crawlerStatsInstance)
			.where(
				and(
					lt(crawlerStatsInstance.startedAt, to),
					gte(crawlerStatsInstance.coveredTo, from)
				)
			)
			.orderBy(asc(crawlerStatsInstance.startedAt));
		return rows;
	}

	async listRecentInstances(limit = 50): Promise<StatsInstanceRow[]> {
		return this.db
			.select()
			.from(crawlerStatsInstance)
			.orderBy(sql`${crawlerStatsInstance.startedAt} DESC`)
			.limit(limit);
	}

	async listPendingHours(limit = 24): Promise<StatsHourPendingRow[]> {
		return this.db
			.select({
				hourTime: crawlerStatsHourPending.hourTime,
				sourceId: crawlerStatsHourPending.sourceId,
				generation: crawlerStatsHourPending.generation,
			})
			.from(crawlerStatsHourPending)
			.orderBy(asc(crawlerStatsHourPending.hourTime))
			.limit(limit);
	}

	async listMinutesForHour(hour: Temporal.Instant, sourceId: string): Promise<StatsMinuteRow[]> {
		const from = toInstant(new Date(hour.epochMilliseconds));
		const to = toInstant(new Date(hour.epochMilliseconds + HOUR_MS));
		const rows = await this.db
			.select()
			.from(crawlerStatsMinute)
			.where(
				and(
					eq(crawlerStatsMinute.sourceId, sourceId),
					gte(crawlerStatsMinute.bucketTime, from),
					lt(crawlerStatsMinute.bucketTime, to)
				)
			)
			.orderBy(asc(crawlerStatsMinute.bucketTime));
		return rows.flatMap((row) => {
			if (!isV2(row.metrics)) return [];
			return [
				{
					sourceId: row.sourceId,
					bucketTime: row.bucketTime,
					metrics: CrawlerStatsMinuteV2Schema.parse(row.metrics),
				},
			];
		});
	}

	async saveHour(
		hour: Temporal.Instant,
		sourceId: string,
		generation: number,
		metrics: CrawlerStatsMinuteV2
	): Promise<void> {
		await this.db.transaction(async (tx) => {
			await tx
				.insert(crawlerStatsHour)
				.values({
					hourTime: hour,
					sourceId,
					formatVersion: CRAWLER_STATS_FORMAT_VERSION,
					metrics,
				})
				.onConflictDoUpdate({
					target: [crawlerStatsHour.hourTime, crawlerStatsHour.sourceId],
					set: { formatVersion: CRAWLER_STATS_FORMAT_VERSION, metrics },
				});
			await tx
				.delete(crawlerStatsHourPending)
				.where(
					and(
						eq(crawlerStatsHourPending.hourTime, hour),
						eq(crawlerStatsHourPending.sourceId, sourceId),
						eq(crawlerStatsHourPending.generation, generation)
					)
				);
		});
	}

	async listHours(from: Temporal.Instant, to: Temporal.Instant): Promise<StatsHourRow[]> {
		const rows = await this.db
			.select()
			.from(crawlerStatsHour)
			.where(and(gte(crawlerStatsHour.hourTime, from), lt(crawlerStatsHour.hourTime, to)))
			.orderBy(asc(crawlerStatsHour.hourTime));
		return rows.map((row) => ({
			hourTime: row.hourTime,
			sourceId: row.sourceId,
			metrics: CrawlerStatsMinuteV2Schema.parse(row.metrics),
		}));
	}

	async saveStates(
		rows: Array<{
			sampledAt: Temporal.Instant;
			scope: string;
			item: string;
			status: string;
			data: unknown;
		}>
	): Promise<void> {
		if (rows.length === 0) return;
		await this.db
			.insert(crawlerStatsState)
			.values(
				rows.map((row) => ({
					...row,
					formatVersion: CRAWLER_STATS_FORMAT_VERSION,
				}))
			)
			.onConflictDoUpdate({
				target: [
					crawlerStatsState.sampledAt,
					crawlerStatsState.scope,
					crawlerStatsState.item,
				],
				set: {
					status: sql`excluded.status`,
					data: sql`excluded.data`,
					formatVersion: sql`excluded.format_version`,
				},
			});
	}

	async listStates(from: Temporal.Instant, to: Temporal.Instant): Promise<StatsStateRow[]> {
		const rows = await this.db
			.select()
			.from(crawlerStatsState)
			.where(and(gte(crawlerStatsState.sampledAt, from), lt(crawlerStatsState.sampledAt, to)))
			.orderBy(asc(crawlerStatsState.sampledAt));
		return rows.map((row) => ({
			sampledAt: row.sampledAt,
			scope: row.scope,
			item: row.item,
			status: row.status,
			data: row.data,
		}));
	}

	async listAvailability(): Promise<Array<{ metric: string; enabledAt: Temporal.Instant }>> {
		return this.db
			.select({
				metric: crawlerStatsMetricAvailability.metric,
				enabledAt: crawlerStatsMetricAvailability.enabledAt,
			})
			.from(crawlerStatsMetricAvailability);
	}

	async markMetricsEnabled(
		metrics: readonly string[],
		enabledAt: Temporal.Instant
	): Promise<void> {
		if (metrics.length === 0) return;
		await this.db
			.insert(crawlerStatsMetricAvailability)
			.values(metrics.map((metric) => ({ metric, enabledAt })))
			.onConflictDoNothing();
	}

	async readRange(
		from: Temporal.Instant,
		to: Temporal.Instant,
		includeHours: boolean
	): Promise<StatsRangeData> {
		return this.db.transaction(async (tx) => {
			const minuteRows = await tx
				.select()
				.from(crawlerStatsMinute)
				.where(
					and(
						gte(crawlerStatsMinute.bucketTime, from),
						lt(crawlerStatsMinute.bucketTime, to)
					)
				)
				.orderBy(asc(crawlerStatsMinute.bucketTime));
			const instanceRows = await tx
				.select()
				.from(crawlerStatsInstance)
				.where(
					and(
						lt(crawlerStatsInstance.startedAt, to),
						gte(crawlerStatsInstance.coveredTo, from)
					)
				)
				.orderBy(asc(crawlerStatsInstance.startedAt));
			const stateRows = await tx
				.select()
				.from(crawlerStatsState)
				.where(
					and(gte(crawlerStatsState.sampledAt, from), lt(crawlerStatsState.sampledAt, to))
				)
				.orderBy(asc(crawlerStatsState.sampledAt));
			const availability = await tx
				.select({
					metric: crawlerStatsMetricAvailability.metric,
					enabledAt: crawlerStatsMetricAvailability.enabledAt,
				})
				.from(crawlerStatsMetricAvailability);
			const pendingHours = await tx
				.select({
					hourTime: crawlerStatsHourPending.hourTime,
					sourceId: crawlerStatsHourPending.sourceId,
					generation: crawlerStatsHourPending.generation,
				})
				.from(crawlerStatsHourPending)
				.orderBy(asc(crawlerStatsHourPending.hourTime));
			const hourRows = includeHours
				? await tx
						.select()
						.from(crawlerStatsHour)
						.where(
							and(
								gte(crawlerStatsHour.hourTime, from),
								lt(crawlerStatsHour.hourTime, to)
							)
						)
						.orderBy(asc(crawlerStatsHour.hourTime))
				: [];
			const minutes: StatsMinuteRow[] = [];
			const legacy: StatsLegacyMinuteRow[] = [];
			for (const row of minuteRows) {
				if (isV2(row.metrics)) {
					minutes.push({
						sourceId: row.sourceId,
						bucketTime: row.bucketTime,
						metrics: CrawlerStatsMinuteV2Schema.parse(row.metrics),
					});
					continue;
				}
				const parsed = CrawlerStatsMinuteSchema.safeParse(row.metrics);
				if (parsed.success)
					legacy.push({
						sourceId: row.sourceId,
						bucketTime: row.bucketTime,
						metrics: parsed.data,
					});
			}
			return {
				minutes,
				legacy,
				instances: instanceRows,
				states: stateRows.map((row) => ({
					sampledAt: row.sampledAt,
					scope: row.scope,
					item: row.item,
					status: row.status,
					data: row.data,
				})),
				hours: hourRows.map((row) => ({
					hourTime: row.hourTime,
					sourceId: row.sourceId,
					metrics: CrawlerStatsMinuteV2Schema.parse(row.metrics),
				})),
				pendingHours,
				availability,
			};
		});
	}

	async latestStateSampleAt(): Promise<number | null> {
		const [row] = await this.db
			.select({ latest: sql<string | Date | null>`max(${crawlerStatsState.sampledAt})` })
			.from(crawlerStatsState);
		if (row?.latest == null) return null;
		return row.latest instanceof Date ? row.latest.getTime() : Date.parse(row.latest);
	}

	async withStateSamplingLock<T>(work: () => Promise<T>): Promise<T | null> {
		return this.db.transaction(async (tx) => {
			const rows = await tx.execute<{ locked: boolean }>(
				sql`SELECT pg_try_advisory_xact_lock(hashtext('crawler_stats_state')) AS locked`
			);
			const first = rows[0];
			if (!first?.locked) return null;
			return work();
		});
	}

	async withHourlyRollupLock<T>(work: () => Promise<T>): Promise<T | null> {
		return this.db.transaction(async (tx) => {
			const rows = await tx.execute<{ locked: boolean }>(
				sql`SELECT pg_try_advisory_xact_lock(hashtext('crawler_stats_hour')) AS locked`
			);
			const first = rows[0];
			if (!first?.locked) return null;
			return work();
		});
	}
}
