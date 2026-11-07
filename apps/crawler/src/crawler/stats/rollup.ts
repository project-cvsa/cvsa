import { and, asc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import {
	CRAWLER_STATS_FORMAT_VERSION,
	CrawlerStatsMinuteSchema,
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

export interface StatsRangeOptions {
	stepMs?: number;
	preferHours?: boolean;
}

export interface StatsRangeData {
	minutes: StatsMinuteRow[];
	coveredBucketTimes?: number[];
	legacy: StatsLegacyMinuteRow[];
	instances: StatsInstanceRow[];
	states: StatsStateRow[];
	latestStates?: StatsStateRow[];
	hours: StatsHourRow[];
	pendingHours: StatsHourPendingRow[];
	availability: Array<{ metric: string; enabledAt: Temporal.Instant }>;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

function isV2(value: unknown): value is CrawlerStatsMinuteV2 {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<CrawlerStatsMinuteV2>;
	return (
		candidate.version === CRAWLER_STATS_FORMAT_VERSION &&
		typeof candidate.counters === "object" &&
		candidate.counters !== null &&
		typeof candidate.distributions === "object" &&
		candidate.distributions !== null
	);
}

function toEpochMs(raw: unknown): number {
	if (raw instanceof Date) return raw.getTime();
	if (typeof raw === "number") return raw;
	if (typeof raw === "string") return Date.parse(raw);
	if (
		typeof raw === "object" &&
		raw !== null &&
		"epochMilliseconds" in raw &&
		typeof (raw as { epochMilliseconds: unknown }).epochMilliseconds === "number"
	) {
		return (raw as { epochMilliseconds: number }).epochMilliseconds;
	}
	return Number.NaN;
}

function mergeContiguousRanges(ranges: Array<[number, number]>): Array<[number, number]> {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	const merged: Array<[number, number]> = [];
	for (const [start, end] of sorted) {
		const last = merged[merged.length - 1];
		if (last && start <= last[1]) {
			last[1] = Math.max(last[1], end);
		} else {
			merged.push([start, end]);
		}
	}
	return merged;
}

export class CrawlerStatsRepository {
	constructor(private readonly db: DatabaseClient) {}

	async saveMinutes(inputs: SaveStatsMinuteInput[]): Promise<void> {
		if (inputs.length === 0) return;
		await this.db.transaction(async (tx) => {
			for (const input of inputs) {
				const metrics = input.metrics;
				await tx
					.insert(crawlerStatsMinute)
					.values({ sourceId: input.sourceId, bucketTime: input.bucketTime, metrics })
					.onConflictDoUpdate({
						target: [crawlerStatsMinute.bucketTime, crawlerStatsMinute.sourceId],
						set: { metrics },
					});
			}

			const latestInstance = inputs[inputs.length - 1]?.instance;
			if (latestInstance) {
				await tx
					.insert(crawlerStatsInstance)
					.values(latestInstance)
					.onConflictDoUpdate({
						target: crawlerStatsInstance.instanceId,
						set: {
							startedAt: latestInstance.startedAt,
							exitedAt: latestInstance.exitedAt,
							lastPersistedAt: latestInstance.lastPersistedAt,
							coveredTo: latestInstance.coveredTo,
							formatVersion: latestInstance.formatVersion,
						},
					});
			}

			const hourBuckets = new Map<
				string,
				{ hourTime: Temporal.Instant; sourceId: string; updatedAt: Temporal.Instant }
			>();
			for (const input of inputs) {
				const hourMs =
					input.bucketTime.epochMilliseconds -
					(input.bucketTime.epochMilliseconds % HOUR_MS);
				const key = `${input.sourceId}:${hourMs}`;
				const existing = hourBuckets.get(key);
				if (
					!existing ||
					input.bucketTime.epochMilliseconds > existing.updatedAt.epochMilliseconds
				) {
					hourBuckets.set(key, {
						hourTime: toInstant(new Date(hourMs)),
						sourceId: input.sourceId,
						updatedAt: input.bucketTime,
					});
				}
			}

			for (const pending of hourBuckets.values()) {
				await tx
					.insert(crawlerStatsHourPending)
					.values({
						hourTime: pending.hourTime,
						sourceId: pending.sourceId,
						generation: 1,
						updatedAt: pending.updatedAt,
					})
					.onConflictDoUpdate({
						target: [
							crawlerStatsHourPending.hourTime,
							crawlerStatsHourPending.sourceId,
						],
						set: {
							generation: sql`${crawlerStatsHourPending.generation} + 1`,
							updatedAt: pending.updatedAt,
						},
					});
			}
		});
	}

	async saveMinute(input: SaveStatsMinuteInput): Promise<void> {
		return this.saveMinutes([input]);
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
					metrics: row.metrics,
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
					metrics: row.metrics,
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
		return rows.flatMap((row) =>
			isV2(row.metrics)
				? [{ hourTime: row.hourTime, sourceId: row.sourceId, metrics: row.metrics }]
				: []
		);
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

	async pruneBefore(cutoff: Temporal.Instant): Promise<void> {
		await this.db.delete(crawlerStatsMinute).where(lt(crawlerStatsMinute.bucketTime, cutoff));
		await this.db.delete(crawlerStatsState).where(lt(crawlerStatsState.sampledAt, cutoff));
		await this.db.delete(crawlerStatsHour).where(lt(crawlerStatsHour.hourTime, cutoff));
	}

	async readRange(
		from: Temporal.Instant,
		to: Temporal.Instant,
		includeHours: boolean,
		options?: StatsRangeOptions
	): Promise<StatsRangeData> {
		const fromMs = from.epochMilliseconds;
		const toMs = to.epochMilliseconds;
		const stepSec = Math.max(60, Math.floor((options?.stepMs ?? MINUTE_MS) / 1000));
		const preferHours = Boolean(options?.preferHours && includeHours);

		return this.db.transaction(async (tx) => {
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

			const hourFrom = toInstant(new Date(Math.floor(fromMs / HOUR_MS) * HOUR_MS));
			const hourRows = includeHours
				? await tx
						.select()
						.from(crawlerStatsHour)
						.where(
							and(
								gte(crawlerStatsHour.hourTime, hourFrom),
								lt(crawlerStatsHour.hourTime, to)
							)
						)
						.orderBy(asc(crawlerStatsHour.hourTime))
				: [];

			let coveredBucketTimes: number[] | undefined;
			let minuteRows: Array<typeof crawlerStatsMinute.$inferSelect>;

			if (preferHours) {
				const pendingSet = new Set(
					pendingHours.map((row) => row.hourTime.epochMilliseconds)
				);
				const rolledHours = new Set(hourRows.map((row) => row.hourTime.epochMilliseconds));

				const coveredRows = await tx
					.select({ bucketTime: crawlerStatsMinute.bucketTime })
					.from(crawlerStatsMinute)
					.where(
						and(
							gte(crawlerStatsMinute.bucketTime, from),
							lt(crawlerStatsMinute.bucketTime, to)
						)
					);
				coveredBucketTimes = coveredRows.map(
					(row) => Math.floor(row.bucketTime.epochMilliseconds / MINUTE_MS) * MINUTE_MS
				);

				const fallbackRanges: Array<[number, number]> = [];
				for (
					let hour = Math.floor(fromMs / HOUR_MS) * HOUR_MS;
					hour < toMs;
					hour += HOUR_MS
				) {
					const subA = Math.max(fromMs, hour);
					const subB = Math.min(toMs, hour + HOUR_MS);
					const isCleanCompleteHour =
						subA === hour &&
						subB === hour + HOUR_MS &&
						!pendingSet.has(hour) &&
						rolledHours.has(hour);
					if (!isCleanCompleteHour) {
						fallbackRanges.push([subA, subB]);
					}
				}

				const mergedRanges = mergeContiguousRanges(fallbackRanges);
				const enabledAt = availability.length
					? Math.min(...availability.map((row) => row.enabledAt.epochMilliseconds))
					: null;
				const mayContainLegacy = enabledAt === null || fromMs < enabledAt;

				const clauses: SQL[] = mergedRanges.flatMap(([startMs, endMs]) => {
					const clause = and(
						gte(crawlerStatsMinute.bucketTime, toInstant(new Date(startMs))),
						lt(crawlerStatsMinute.bucketTime, toInstant(new Date(endMs)))
					);
					return clause ? [clause] : [];
				});
				if (mayContainLegacy) {
					const legacyClause = and(
						gte(crawlerStatsMinute.bucketTime, from),
						lt(crawlerStatsMinute.bucketTime, to),
						sql`(${crawlerStatsMinute.metrics}->>'version')::int IS DISTINCT FROM ${CRAWLER_STATS_FORMAT_VERSION}`
					);
					if (legacyClause) clauses.push(legacyClause);
				}

				minuteRows =
					clauses.length > 0
						? await tx
								.select()
								.from(crawlerStatsMinute)
								.where(clauses.length === 1 ? clauses[0] : or(...clauses))
								.orderBy(asc(crawlerStatsMinute.bucketTime))
						: [];
			} else {
				minuteRows = await tx
					.select()
					.from(crawlerStatsMinute)
					.where(
						and(
							gte(crawlerStatsMinute.bucketTime, from),
							lt(crawlerStatsMinute.bucketTime, to)
						)
					)
					.orderBy(asc(crawlerStatsMinute.bucketTime));
			}

			// Fetch only the latest state per item for overview + one latest gauge row per series bucket
			// instead of loading up to 120,960 30-second state rows on 24h/7d windows.
			const latestStateRaw = await tx.execute<{
				sampled_at: string | Date;
				scope: string;
				item: string;
				status: string;
				data: unknown;
			}>(sql`
				SELECT DISTINCT ON (item)
					sampled_at, scope, item, status, data
				FROM crawler_stats_state
				WHERE sampled_at >= ${from.toString()}::timestamptz
				  AND sampled_at < ${to.toString()}::timestamptz
				ORDER BY item, sampled_at DESC
			`);
			const seriesStateRaw = await tx.execute<{
				sampled_at: string | Date;
				scope: string;
				item: string;
				status: string;
				data: unknown;
			}>(sql`
				SELECT sampled_at, scope, item, status, data FROM (
					SELECT DISTINCT ON (bucket_id, item)
						bucket_id, sampled_at, scope, item, status, data
					FROM (
						SELECT
							floor(extract(epoch from sampled_at) / ${stepSec}::numeric)::bigint AS bucket_id,
							sampled_at, scope, item, status, data
						FROM crawler_stats_state
						WHERE sampled_at >= ${from.toString()}::timestamptz
						  AND sampled_at < ${to.toString()}::timestamptz
						  AND item IN ('queues', 'tracking')
					) bucketed
					ORDER BY bucket_id, item, sampled_at DESC
				) sampled
				ORDER BY sampled_at ASC
			`);

			const minutes: StatsMinuteRow[] = [];
			const legacy: StatsLegacyMinuteRow[] = [];
			for (const row of minuteRows) {
				if (isV2(row.metrics)) {
					minutes.push({
						sourceId: row.sourceId,
						bucketTime: row.bucketTime,
						metrics: row.metrics,
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

			const mapStateRow = (row: {
				sampled_at: string | Date;
				scope: string;
				item: string;
				status: string;
				data: unknown;
			}): StatsStateRow => ({
				sampledAt: toInstant(new Date(toEpochMs(row.sampled_at))),
				scope: row.scope,
				item: row.item,
				status: row.status,
				data:
					typeof row.data === "string"
						? (() => {
								try {
									return JSON.parse(row.data);
								} catch {
									return row.data;
								}
							})()
						: row.data,
			});

			return {
				minutes,
				coveredBucketTimes,
				legacy,
				instances: instanceRows,
				states: seriesStateRaw.map(mapStateRow),
				latestStates: latestStateRaw.map(mapStateRow),
				hours: hourRows.flatMap((row) =>
					isV2(row.metrics)
						? [
								{
									hourTime: row.hourTime,
									sourceId: row.sourceId,
									metrics: row.metrics,
								},
							]
						: []
				),
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
