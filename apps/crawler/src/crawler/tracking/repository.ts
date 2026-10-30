import { activeTaskResource } from "../shared/taskContext";
import type { DatabaseClient, Temporal, VideoTracking } from "@cvsa/snapshot-db";
import { and, or, toInstant } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type {
	ITrackingRepository,
	ListTrackingVideosParams,
	ListTrackingVideosResult,
	OverdueTrackingSummary,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "./repository.interface";

export class TrackingRepository implements ITrackingRepository {
	constructor(private readonly db: DatabaseClient) {}

	async findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		return traceTask("tracking.findDueVideos", async () => {
			const at = beforeTime ?? toInstant(new Date());
			return activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) =>
					and(t.nextSnapshotAt.lte(at), or(t.leaseUntil.isNull(), t.leaseUntil.lte(at)))
				)
				.orderBy([(t) => t.priority.asc(), (t) => t.nextSnapshotAt.asc()])
				.limit(limit)
				.all();
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
			const leased: VideoTracking[] = [];
			// `updateAll` emits the updated rows, so this doubles as the
			// compare-and-set acknowledgement: only rows whose lease was free (or
			// expired) come back and get dispatched.
			for await (const row of activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) =>
					and(
						t.aid.in(aids),
						t.nextSnapshotAt.lte(at),
						or(t.leaseUntil.isNull(), t.leaseUntil.lte(at))
					)
				)
				.updateAll({ leaseUntil })) {
				leased.push(row);
			}
			return leased;
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
		return traceTask("tracking.getTracking", () =>
			activeTaskResource(this.db).orm.public.VideoTracking.where({ aid }).first()
		);
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		if (aids.length === 0) return [];
		return traceTask("tracking.getTrackings", () =>
			activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) => t.aid.in(aids))
				.all()
		);
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		return traceTask("tracking.upsertTracking", async () => {
			const existing = await activeTaskResource(this.db)
				.orm.public.VideoTracking.where({
					aid: input.aid,
				})
				.first();
			if (existing) {
				const updated = await activeTaskResource(this.db)
					.orm.public.VideoTracking.where({
						aid: input.aid,
					})
					.update({
						state: input.state ?? existing.state,
						nextSnapshotAt: input.nextSnapshotAt,
						scheduleReason:
							input.scheduleReason !== undefined
								? input.scheduleReason
								: existing.scheduleReason,
						nextMetadataAt:
							input.nextMetadataAt !== undefined
								? input.nextMetadataAt
								: existing.nextMetadataAt,
						leaseUntil:
							input.leaseUntil !== undefined ? input.leaseUntil : existing.leaseUntil,
						lastError:
							input.lastError !== undefined ? input.lastError : existing.lastError,
						lastViews: input.lastViews ?? existing.lastViews,
						lastCapturedAt: input.lastCapturedAt ?? existing.lastCapturedAt,
						velocity: input.velocity ?? existing.velocity,
						targetMilestone:
							input.targetMilestone !== undefined
								? input.targetMilestone
								: existing.targetMilestone,
						etaHours: input.etaHours !== undefined ? input.etaHours : existing.etaHours,
						publishedAt: input.publishedAt ?? existing.publishedAt,
						priority: input.priority ?? existing.priority,
						consecutiveFails: input.consecutiveFails ?? existing.consecutiveFails,
					});
				if (updated) return updated;
			}

			return activeTaskResource(this.db).orm.public.VideoTracking.create({
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
			});
		});
	}

	async updateSchedule(
		aid: bigint,
		update: UpdateScheduleInput,
		expectedLeaseUntil?: Temporal.Instant
	): Promise<void> {
		await traceTask("tracking.updateSchedule", async () => {
			for await (const _ of activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) =>
					expectedLeaseUntil
						? and(t.aid.eq(aid), t.leaseUntil.eq(expectedLeaseUntil))
						: t.aid.eq(aid)
				)
				.updateAll({
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
				})) {
				/* Drain conditional updates. */
			}
		});
	}

	async releaseLeases(aids: bigint[], expectedLeaseUntil?: Temporal.Instant): Promise<void> {
		if (aids.length === 0) return;
		await traceTask("tracking.releaseLeases", async () => {
			for await (const _ of activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) =>
					expectedLeaseUntil
						? and(t.aid.in(aids), t.leaseUntil.eq(expectedLeaseUntil))
						: t.aid.in(aids)
				)
				.updateAll({ leaseUntil: null })) {
				// updateAll streams updated rows
			}
		});
	}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		if (aids.length === 0) return;
		await traceTask("tracking.postponeSchedule", async () => {
			for await (const _ of activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) => t.aid.in(aids))
				.updateAll({
					nextSnapshotAt,
				})) {
				// updateAll streams updated rows
			}
		});
	}

	async countOverdueVideos(now: Temporal.Instant | Date): Promise<OverdueTrackingSummary> {
		return traceTask("tracking.countOverdueVideos", async () => {
			const at = now instanceof Date ? toInstant(now) : now;
			const base = activeTaskResource(this.db).orm.public.VideoTracking.where((t) =>
				and(t.nextSnapshotAt.lte(at), or(t.leaseUntil.isNull(), t.leaseUntil.lte(at)))
			);
			const aggregate = await base.aggregate((agg) => ({ overdueCount: agg.count() }));
			const overdueCount = aggregate.overdueCount;
			if (overdueCount === 0) return { overdueCount: 0, maxOverdueLagSec: 0 };

			const oldest = await activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) =>
					and(t.nextSnapshotAt.lte(at), or(t.leaseUntil.isNull(), t.leaseUntil.lte(at)))
				)
				.orderBy((t) => t.nextSnapshotAt.asc())
				.first();
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
						.orm.public.BilibiliVideoMetadata.where((m) =>
							/^BV[0-9a-z]{10}$/i.test(search)
								? m.bvid.eq(search)
								: m.title.like(`%${search.replace(/[\\%_]/g, "\\$&")}%`)
						)
						.all();
					matchingAids = matches.map((metadata) => metadata.aid);
					if (matchingAids.length === 0) return { items: [], total: 0 };
				}
			}

			const collection = activeTaskResource(this.db).orm.public.VideoTracking.where((t) => {
				const conditions = [];
				if (state !== undefined) conditions.push(t.state.eq(state));
				if (exactAid !== undefined) conditions.push(t.aid.eq(exactAid));
				else if (matchingAids !== undefined) conditions.push(t.aid.in(matchingAids));

				if (params.statusFilter === "failing") {
					conditions.push(t.consecutiveFails.gt(0));
				} else if (params.statusFilter === "highPriority") {
					conditions.push(t.priority.eq(1));
				} else if (params.statusFilter === "normal") {
					conditions.push(t.consecutiveFails.eq(0));
				}

				const first = conditions[0];
				if (!first) return t.aid.gte(0n);
				const second = conditions[1];
				if (!second) return first;
				return and(first, second, ...conditions.slice(2));
			});

			const aggregate = await collection.aggregate((agg) => ({ total: agg.count() }));

			const isAsc = params.sortOrder === "asc";
			const items = await (params.sortBy === "views"
				? collection.orderBy([(t) => (isAsc ? t.lastViews.asc() : t.lastViews.desc())])
				: params.sortBy === "velocity"
					? collection.orderBy([(t) => (isAsc ? t.velocity.asc() : t.velocity.desc())])
					: params.sortBy === "nextSnapshotAt"
						? collection.orderBy([
								(t) => (isAsc ? t.nextSnapshotAt.asc() : t.nextSnapshotAt.desc()),
							])
						: params.sortBy === "consecutiveFails"
							? collection.orderBy([
									(t) =>
										isAsc
											? t.consecutiveFails.asc()
											: t.consecutiveFails.desc(),
								])
							: params.sortBy === "publishedAt"
								? collection.orderBy([
										(t) => (isAsc ? t.publishedAt.asc() : t.publishedAt.desc()),
									])
								: collection.orderBy([
										(t) => (isAsc ? t.updatedAt.asc() : t.updatedAt.desc()),
									])
			)
				.orderBy((t) => t.aid.desc())
				.limit(limit)
				.offset(offset)
				.all();

			return { items, total: aggregate.total };
		});
	}

	async deleteTracking(aid: bigint): Promise<boolean> {
		return traceTask("tracking.deleteTracking", async () => {
			let deleted = false;
			for await (const _ of activeTaskResource(this.db)
				.orm.public.VideoTracking.where((t) => t.aid.eq(aid))
				.deleteAll()) {
				deleted = true;
			}
			return deleted;
		});
	}
}
