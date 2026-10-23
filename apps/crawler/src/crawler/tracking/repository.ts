import type { DatabaseClient, Temporal, VideoTracking } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type {
	ITrackingRepository,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "./repository.interface";

export class TrackingRepository implements ITrackingRepository {
	constructor(private readonly db: DatabaseClient) {}

	async findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		return traceTask("tracking.findDueVideos", async () => {
			const base = this.db.orm.public.VideoTracking;
			const filtered = beforeTime
				? base.where((t) => t.nextSnapshotAt.lte(beforeTime))
				: base;
			return filtered
				.orderBy([(t) => t.priority.asc(), (t) => t.nextSnapshotAt.asc()])
				.limit(limit)
				.all();
		});
	}

	async getTracking(aid: bigint): Promise<VideoTracking | null> {
		return traceTask("tracking.getTracking", () =>
			this.db.orm.public.VideoTracking.where({ aid }).first()
		);
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		if (aids.length === 0) return [];
		return traceTask("tracking.getTrackings", () =>
			this.db.orm.public.VideoTracking.where((t) => t.aid.in(aids)).all()
		);
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		return traceTask("tracking.upsertTracking", async () => {
			const existing = await this.db.orm.public.VideoTracking.where({
				aid: input.aid,
			}).first();
			if (existing) {
				const updated = await this.db.orm.public.VideoTracking.where({
					aid: input.aid,
				}).update({
					state: input.state ?? existing.state,
					nextSnapshotAt: input.nextSnapshotAt,
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

			return this.db.orm.public.VideoTracking.create({
				aid: input.aid,
				state: input.state ?? "regular",
				nextSnapshotAt: input.nextSnapshotAt,
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

	async updateSchedule(aid: bigint, update: UpdateScheduleInput): Promise<void> {
		await traceTask("tracking.updateSchedule", () =>
			this.db.orm.public.VideoTracking.where({ aid }).update({
				...(update.state ? { state: update.state } : {}),
				nextSnapshotAt: update.nextSnapshotAt,
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
		);
	}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		if (aids.length === 0) return;
		await traceTask("tracking.postponeSchedule", async () => {
			for await (const _ of this.db.orm.public.VideoTracking.where((t) =>
				t.aid.in(aids)
			).updateAll({
				nextSnapshotAt,
			})) {
				// updateAll streams updated rows
			}
		});
	}
}
