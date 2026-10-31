import { and, asc, count, desc, eq, gt, inArray, isNull, like, lte, or } from "drizzle-orm";
import { activeTaskResource } from "../shared/taskContext";
import type { DatabaseClient, Temporal, VideoTracking } from "@cvsa/snapshot-db";
import { bilibiliVideoMetadata, toInstant, videoTracking } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
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
	constructor(private readonly db: DatabaseClient) {}

	async findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		return traceTask("tracking.findDueVideos", async () => {
			const at = beforeTime ?? toInstant(new Date());
			return activeTaskResource(this.db)
				.select()
				.from(videoTracking)
				.where(
					and(
						lte(videoTracking.nextSnapshotAt, at),
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
		return traceTask("tracking.leaseVideos", async () => {
			const at = now ?? toInstant(new Date());
			// `returning()` doubles as the compare-and-set acknowledgement: only rows
			// whose lease was free (or expired) come back and get dispatched.
			return activeTaskResource(this.db)
				.update(videoTracking)
				.set({ leaseUntil })
				.where(
					and(
						inArray(AID, aids),
						lte(videoTracking.nextSnapshotAt, at),
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
		return traceTask("tracking.claimDueVideos", async () => {
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
		return traceTask("tracking.getTracking", async () => {
			const [row] = await activeTaskResource(this.db)
				.select()
				.from(videoTracking)
				.where(eq(AID, aid))
				.limit(1);
			return row ?? null;
		});
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		if (aids.length === 0) return [];
		return traceTask("tracking.getTrackings", () =>
			activeTaskResource(this.db).select().from(videoTracking).where(inArray(AID, aids))
		);
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		return traceTask("tracking.upsertTracking", async () => {
			const existing = await this.getTracking(input.aid);
			if (existing) {
				const [updated] = await activeTaskResource(this.db)
					.update(videoTracking)
					.set({
						state: input.state ?? existing.state,
						nextSnapshotAt: input.nextSnapshotAt,
						scheduleReason:
							input.scheduleReason !== undefined
								? input.scheduleReason
								: existing.scheduleReason,
						...(input.nextMetadataAt !== undefined
							? { nextMetadataAt: input.nextMetadataAt }
							: {}),
						...(input.leaseUntil !== undefined ? { leaseUntil: input.leaseUntil } : {}),
						...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
						lastViews: input.lastViews ?? existing.lastViews,
						...(input.lastCapturedAt !== undefined
							? { lastCapturedAt: input.lastCapturedAt }
							: {}),
						velocity: input.velocity ?? existing.velocity,
						...(input.targetMilestone !== undefined
							? { targetMilestone: input.targetMilestone }
							: {}),
						...(input.etaHours !== undefined ? { etaHours: input.etaHours } : {}),
						...(input.publishedAt !== undefined
							? { publishedAt: input.publishedAt }
							: {}),
						priority: input.priority ?? existing.priority,
						consecutiveFails: input.consecutiveFails ?? existing.consecutiveFails,
					})
					.where(eq(AID, input.aid))
					.returning();
				if (updated) return updated;
			}

			const [created] = await activeTaskResource(this.db)
				.insert(videoTracking)
				.values({
					aid: input.aid,
					state: input.state ?? "regular",
					nextSnapshotAt: input.nextSnapshotAt,
					scheduleReason: input.scheduleReason ?? "initial",
					nextMetadataAt: input.nextMetadataAt ?? null,
					leaseUntil: input.leaseUntil ?? null,
					lastError: input.lastError ?? null,
					lastViews: input.lastViews ?? 0,
					lastCapturedAt: input.lastCapturedAt ?? null,
					velocity: input.velocity ?? 0,
					targetMilestone: input.targetMilestone ?? null,
					etaHours: input.etaHours ?? null,
					publishedAt: input.publishedAt ?? null,
					priority: input.priority ?? 2,
					consecutiveFails: input.consecutiveFails ?? 0,
				})
				.returning();
			if (!created) throw new Error(`Failed to insert tracking row for aid=${input.aid}`);
			return created;
		});
	}

	async updateSchedule(
		aid: bigint,
		update: UpdateScheduleInput,
		expectedLeaseUntil?: Temporal.Instant
	): Promise<void> {
		await traceTask("tracking.updateSchedule", async () => {
			await activeTaskResource(this.db)
				.update(videoTracking)
				.set({
					...(update.state ? { state: update.state } : {}),
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

	async releaseLeases(aids: bigint[], expectedLeaseUntil?: Temporal.Instant): Promise<void> {
		if (aids.length === 0) return;
		await traceTask("tracking.releaseLeases", async () => {
			await activeTaskResource(this.db)
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
		await traceTask("tracking.postponeSchedule", async () => {
			await activeTaskResource(this.db)
				.update(videoTracking)
				.set({ nextSnapshotAt })
				.where(inArray(AID, aids));
		});
	}

	async countOverdueVideos(now: Temporal.Instant | Date): Promise<OverdueTrackingSummary> {
		return traceTask("tracking.countOverdueVideos", async () => {
			const at = now instanceof Date ? toInstant(now) : now;
			const due = and(
				lte(videoTracking.nextSnapshotAt, at),
				or(isNull(videoTracking.leaseUntil), lte(videoTracking.leaseUntil, at))
			);
			const db = activeTaskResource(this.db);
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
		return traceTask("tracking.listTrackingVideos", async () => {
			const limit = Math.min(Math.max(params.limit, 1), 200);
			const offset = Math.max(params.offset, 0);
			const search = params.search?.trim();
			const state = params.state;

			let matchingAids: bigint[] | undefined;
			let exactAid: bigint | undefined;
			if (search) {
				if (/^(?:av)?\d+$/i.test(search)) {
					exactAid = BigInt(search.replace(/^av/i, ""));
				} else {
					const matches = await activeTaskResource(this.db)
						.select({ aid: bilibiliVideoMetadata.aid })
						.from(bilibiliVideoMetadata)
						.where(
							/^BV[0-9a-z]{10}$/i.test(search)
								? eq(bilibiliVideoMetadata.bvid, search)
								: like(
										bilibiliVideoMetadata.title,
										`%${search.replace(/[\\%_]/g, "\\$&")}%`
									)
						);
					matchingAids = matches.map((metadata) => metadata.aid);
					if (matchingAids.length === 0) return { items: [], total: 0 };
				}
			}

			const conditions = [];
			if (state !== undefined) conditions.push(eq(videoTracking.state, state));
			if (exactAid !== undefined) conditions.push(eq(AID, exactAid));
			else if (matchingAids !== undefined) conditions.push(inArray(AID, matchingAids));

			if (params.statusFilter === "failing") {
				conditions.push(gt(videoTracking.consecutiveFails, 0));
			} else if (params.statusFilter === "highPriority") {
				conditions.push(eq(videoTracking.priority, 1));
			} else if (params.statusFilter === "normal") {
				conditions.push(eq(videoTracking.consecutiveFails, 0));
			}

			const where = conditions.length > 0 ? and(...conditions) : undefined;
			const db = activeTaskResource(this.db);

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
		return traceTask("tracking.deleteTracking", async () => {
			const deleted = await activeTaskResource(this.db)
				.delete(videoTracking)
				.where(eq(AID, aid))
				.returning({ aid: AID });
			return deleted.length > 0;
		});
	}
}
