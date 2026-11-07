import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	gt,
	inArray,
	isNotNull,
	isNull,
	like,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { activeDatabase } from "../shared/databaseContext";
import type { DatabaseClient, Temporal, VideoTracking } from "@cvsa/snapshot-db";
import { bilibiliVideoMetadata, toInstant, videoTracking } from "@cvsa/snapshot-db";
import { createDatabaseTracer } from "../stats/databaseMetrics";
import type { StatsRecorder } from "../stats/types";
import type {
	ITrackingRepository,
	ListTrackingVideosParams,
	ListTrackingVideosResult,
	OverdueTrackingSummary,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "./repository.interface";

const AID = videoTracking.aid;

export class TrackingRepository implements ITrackingRepository {
	private readonly trace;
	private readonly stats: StatsRecorder | undefined;
	constructor(
		private readonly db: DatabaseClient,
		stats?: StatsRecorder
	) {
		this.trace = createDatabaseTracer(stats, "tracking");
		this.stats = stats;
	}

	async findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		return this.trace("tracking.findDueVideos", async () => {
			const at = beforeTime ?? toInstant(new Date());
			return activeDatabase(this.db)
				.select()
				.from(videoTracking)
				.where(
					and(
						lte(videoTracking.nextSnapshotAt, at),
						or(isNull(videoTracking.eligibleAt), lte(videoTracking.eligibleAt, at)),
						or(isNull(videoTracking.leaseUntil), lte(videoTracking.leaseUntil, at))
					)
				)
				.orderBy(asc(videoTracking.priority), asc(videoTracking.nextSnapshotAt))
				.limit(limit);
		});
	}

	async leaseVideos(
		aids: bigint[],
		leaseUntil: Temporal.Instant,
		now?: Temporal.Instant
	): Promise<VideoTracking[]> {
		if (aids.length === 0) return [];
		return this.trace("tracking.leaseVideos", async () => {
			const at = now ?? toInstant(new Date());
			// `returning()` doubles as the compare-and-set acknowledgement: only rows
			// whose lease was free (or expired) come back and get dispatched.
			return activeDatabase(this.db)
				.update(videoTracking)
				.set({ leaseUntil })
				.where(
					and(
						inArray(AID, aids),
						lte(videoTracking.nextSnapshotAt, at),
						or(isNull(videoTracking.eligibleAt), lte(videoTracking.eligibleAt, at)),
						or(isNull(videoTracking.leaseUntil), lte(videoTracking.leaseUntil, at))
					)
				)
				.returning();
		});
	}

	async claimDueVideos(
		now: Temporal.Instant,
		limit: number,
		leaseDurationMs: number
	): Promise<VideoTracking[]> {
		return this.trace("tracking.claimDueVideos", async () => {
			const due = await this.findDueVideos(limit, now);
			if (due.length === 0) return [];
			const leaseUntil = toInstant(new Date(now.epochMilliseconds + leaseDurationMs));
			return this.leaseVideos(
				due.map((video) => video.aid),
				leaseUntil,
				now
			);
		});
	}

	async getTracking(aid: bigint): Promise<VideoTracking | null> {
		return this.trace("tracking.getTracking", async () => {
			const [row] = await activeDatabase(this.db)
				.select()
				.from(videoTracking)
				.where(eq(AID, aid))
				.limit(1);
			return row ?? null;
		});
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		if (aids.length === 0) return [];
		return this.trace("tracking.getTrackings", () =>
			activeDatabase(this.db).select().from(videoTracking).where(inArray(AID, aids))
		);
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		return this.trace("tracking.upsertTracking", async () => {
			const updateSet: Record<string, unknown> = {
				nextSnapshotAt: input.nextSnapshotAt,
			};
			if (input.state !== undefined) updateSet.state = input.state;
			if (input.eligibleAt !== undefined) updateSet.eligibleAt = input.eligibleAt;
			if (input.scheduleReason !== undefined) updateSet.scheduleReason = input.scheduleReason;
			if (input.nextMetadataAt !== undefined) updateSet.nextMetadataAt = input.nextMetadataAt;
			if (input.leaseUntil !== undefined) updateSet.leaseUntil = input.leaseUntil;
			if (input.lastError !== undefined) updateSet.lastError = input.lastError;
			if (input.lastViews !== undefined) updateSet.lastViews = input.lastViews;
			if (input.firstCapturedAt !== undefined)
				updateSet.firstCapturedAt = input.firstCapturedAt;
			if (input.lastCapturedAt !== undefined) updateSet.lastCapturedAt = input.lastCapturedAt;
			if (input.velocity !== undefined) updateSet.velocity = input.velocity;
			if (input.targetMilestone !== undefined)
				updateSet.targetMilestone = input.targetMilestone;
			if (input.etaHours !== undefined) updateSet.etaHours = input.etaHours;
			if (input.publishedAt !== undefined) updateSet.publishedAt = input.publishedAt;
			if (input.priority !== undefined) updateSet.priority = input.priority;
			if (input.consecutiveFails !== undefined)
				updateSet.consecutiveFails = input.consecutiveFails;

			const [row] = await activeDatabase(this.db)
				.insert(videoTracking)
				.values({
					aid: input.aid,
					eligibleAt: input.eligibleAt ?? null,
					state: input.state ?? "regular",
					nextSnapshotAt: input.nextSnapshotAt,
					scheduleReason: input.scheduleReason ?? "initial",
					nextMetadataAt: input.nextMetadataAt ?? null,
					leaseUntil: input.leaseUntil ?? null,
					lastError: input.lastError ?? null,
					lastViews: input.lastViews ?? 0,
					firstCapturedAt: input.firstCapturedAt ?? null,
					lastCapturedAt: input.lastCapturedAt ?? null,
					velocity: input.velocity ?? 0,
					targetMilestone: input.targetMilestone ?? null,
					etaHours: input.etaHours ?? null,
					publishedAt: input.publishedAt ?? null,
					priority: input.priority ?? 2,
					consecutiveFails: input.consecutiveFails ?? 0,
				})
				.onConflictDoUpdate({
					target: AID,
					set: updateSet,
				})
				.returning();

			if (!row)
				throw new Error(`Failed to insert or update tracking row for aid=${input.aid}`);
			this.stats?.record("trackingCreated");
			return row;
		});
	}

	async updateSchedule(
		aid: bigint,
		update: UpdateScheduleInput,
		expectedLeaseUntil?: Temporal.Instant
	): Promise<void> {
		await this.trace("tracking.updateSchedule", async () => {
			await activeDatabase(this.db)
				.update(videoTracking)
				.set({
					...(update.state ? { state: update.state } : {}),
					...(update.eligibleAt !== undefined ? { eligibleAt: update.eligibleAt } : {}),
					...(update.nextSnapshotAt !== undefined
						? { nextSnapshotAt: update.nextSnapshotAt }
						: {}),
					...(update.scheduleReason !== undefined
						? { scheduleReason: update.scheduleReason }
						: {}),
					...(update.nextMetadataAt !== undefined
						? { nextMetadataAt: update.nextMetadataAt }
						: {}),
					...(update.leaseUntil !== undefined ? { leaseUntil: update.leaseUntil } : {}),
					...(update.lastError !== undefined ? { lastError: update.lastError } : {}),
					...(update.lastViews !== undefined ? { lastViews: update.lastViews } : {}),
					...(update.firstCapturedAt !== undefined
						? { firstCapturedAt: update.firstCapturedAt }
						: {}),
					...(update.lastCapturedAt !== undefined
						? { lastCapturedAt: update.lastCapturedAt }
						: {}),
					...(update.velocity !== undefined ? { velocity: update.velocity } : {}),
					...(update.targetMilestone !== undefined
						? { targetMilestone: update.targetMilestone }
						: {}),
					...(update.etaHours !== undefined ? { etaHours: update.etaHours } : {}),
					...(update.priority !== undefined ? { priority: update.priority } : {}),
					...(update.consecutiveFails !== undefined
						? { consecutiveFails: update.consecutiveFails }
						: {}),
				})
				.where(
					expectedLeaseUntil
						? and(eq(AID, aid), eq(videoTracking.leaseUntil, expectedLeaseUntil))
						: eq(AID, aid)
				);
		});
	}

	async updateSchedules(
		updates: Array<{
			aid: bigint;
			update: UpdateScheduleInput;
			expectedLeaseUntil?: Temporal.Instant;
		}>
	): Promise<void> {
		if (updates.length === 0) return;
		await this.trace("tracking.updateSchedules", async () => {
			for (const item of updates) {
				await this.updateSchedule(item.aid, item.update, item.expectedLeaseUntil);
			}
		});
	}

	async listDueMetadata(limit: number, now: Temporal.Instant): Promise<VideoTracking[]> {
		return this.trace("tracking.listDueMetadata", async () => {
			return activeDatabase(this.db)
				.select()
				.from(videoTracking)
				.where(
					and(
						isNotNull(videoTracking.nextMetadataAt),
						lte(videoTracking.nextMetadataAt, now)
					)
				)
				.orderBy(asc(videoTracking.nextMetadataAt))
				.limit(limit);
		});
	}

	async releaseLeases(aids: bigint[], expectedLeaseUntil?: Temporal.Instant): Promise<void> {
		if (aids.length === 0) return;
		await this.trace("tracking.releaseLeases", async () => {
			await activeDatabase(this.db)
				.update(videoTracking)
				.set({ leaseUntil: null })
				.where(
					expectedLeaseUntil
						? and(inArray(AID, aids), eq(videoTracking.leaseUntil, expectedLeaseUntil))
						: inArray(AID, aids)
				);
		});
	}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		if (aids.length === 0) return;
		await this.trace("tracking.postponeSchedule", async () => {
			await activeDatabase(this.db)
				.update(videoTracking)
				.set({ nextSnapshotAt })
				.where(inArray(AID, aids));
		});
	}

	async countOverdueVideos(now: Temporal.Instant | Date): Promise<OverdueTrackingSummary> {
		return this.trace("tracking.countOverdueVideos", async () => {
			const at = now instanceof Date ? toInstant(now) : now;
			const due = and(
				lte(videoTracking.nextSnapshotAt, at),
				or(isNull(videoTracking.leaseUntil), lte(videoTracking.leaseUntil, at))
			);
			const db = activeDatabase(this.db);
			const [totals] = await db
				.select({ overdueCount: count() })
				.from(videoTracking)
				.where(due);
			const overdueCount = totals?.overdueCount ?? 0;
			if (overdueCount === 0) return { overdueCount: 0, maxOverdueLagSec: 0 };

			const [oldest] = await db
				.select()
				.from(videoTracking)
				.where(due)
				.orderBy(asc(videoTracking.nextSnapshotAt))
				.limit(1);
			if (!oldest) return { overdueCount, maxOverdueLagSec: 0 };

			const lagMs = at.epochMilliseconds - oldest.nextSnapshotAt.epochMilliseconds;
			return {
				overdueCount,
				maxOverdueLagSec: Math.max(0, Math.floor(lagMs / 1_000)),
			};
		});
	}

	async listTrackingVideos(params: ListTrackingVideosParams): Promise<ListTrackingVideosResult> {
		return this.trace("tracking.listTrackingVideos", async () => {
			const limit = Math.min(Math.max(params.limit, 1), 200);
			const offset = Math.max(params.offset, 0);
			const search = params.search?.trim();
			const state = params.state;
			const db = activeDatabase(this.db);

			const conditions = [];
			if (state !== undefined) conditions.push(eq(videoTracking.state, state));
			if (search) {
				if (/^(?:av)?\d+$/i.test(search)) {
					conditions.push(eq(AID, BigInt(search.replace(/^av/i, ""))));
				} else {
					conditions.push(
						exists(
							db
								.select({ one: sql`1` })
								.from(bilibiliVideoMetadata)
								.where(
									and(
										eq(bilibiliVideoMetadata.aid, AID),
										/^BV[0-9a-z]{10}$/i.test(search)
											? eq(bilibiliVideoMetadata.bvid, search)
											: like(
													bilibiliVideoMetadata.title,
													`%${search.replace(/[\\%_]/g, "\\$&")}%`
												)
									)
								)
						)
					);
				}
			}

			if (params.statusFilter === "failing") {
				conditions.push(gt(videoTracking.consecutiveFails, 0));
			} else if (params.statusFilter === "highPriority") {
				conditions.push(eq(videoTracking.priority, 1));
			} else if (params.statusFilter === "normal") {
				conditions.push(eq(videoTracking.consecutiveFails, 0));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;

			const [totals] = await db.select({ total: count() }).from(videoTracking).where(where);

			const isAsc = params.sortOrder === "asc";
			const direction = isAsc ? asc : desc;
			const sortColumn =
				params.sortBy === "views"
					? videoTracking.lastViews
					: params.sortBy === "velocity"
						? videoTracking.velocity
						: params.sortBy === "nextSnapshotAt"
							? videoTracking.nextSnapshotAt
							: params.sortBy === "consecutiveFails"
								? videoTracking.consecutiveFails
								: params.sortBy === "publishedAt"
									? videoTracking.publishedAt
									: videoTracking.updatedAt;

			const items = await db
				.select()
				.from(videoTracking)
				.where(where)
				.orderBy(direction(sortColumn), desc(AID))
				.limit(limit)
				.offset(offset);

			return { items, total: totals?.total ?? 0 };
		});
	}

	async deleteTracking(aid: bigint): Promise<boolean> {
		return this.trace("tracking.deleteTracking", async () => {
			const deleted = await activeDatabase(this.db)
				.delete(videoTracking)
				.where(eq(AID, aid))
				.returning({ aid: AID });
			return deleted.length > 0;
		});
	}
}
