import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { activeDatabase } from "../shared/databaseContext";
import type {
	DatabaseClient,
	LatestVideoSnapshot,
	VideoSnapshot,
	Temporal,
} from "@cvsa/snapshot-db";
import { latestVideoSnapshot, videoSnapshot, videoTracking, toInstant } from "@cvsa/snapshot-db";
import { MILESTONE_HISTORY_WINDOWS_MS } from "../tracking/scheduler";
import { createDatabaseTracer } from "../stats/databaseMetrics";
import type { StatsRecorder } from "../stats/types";
import type { CreateSnapshotInput, ISnapshotRepository } from "./repository.interface";

interface RawSnapshotRow {
	aid: string | number | bigint;
	captured_at: Date | string;
	views: number;
	coins: number;
	likes: number;
	favorites: number;
	shares: number;
	danmakus: number;
	replies: number;
}

function toVideoSnapshot(row: RawSnapshotRow): VideoSnapshot {
	return {
		aid: BigInt(row.aid),
		capturedAt: toInstant(
			row.captured_at instanceof Date ? row.captured_at : new Date(row.captured_at)
		),
		views: Number(row.views),
		coins: Number(row.coins),
		likes: Number(row.likes),
		favorites: Number(row.favorites),
		shares: Number(row.shares),
		danmakus: Number(row.danmakus),
		replies: Number(row.replies),
	};
}

export class SnapshotRepository implements ISnapshotRepository {
	private readonly trace;
	constructor(
		private readonly db: DatabaseClient,
		stats?: StatsRecorder
	) {
		this.trace = createDatabaseTracer(stats, "snapshot");
	}

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<number> {
		if (snapshots.length === 0) return 0;
		return this.trace("snapshot.createSnapshots", async () => {
			const inserted = await activeDatabase(this.db)
				.insert(videoSnapshot)
				.values(
					snapshots.map((s) => ({
						aid: s.aid,
						...(s.capturedAt ? { capturedAt: s.capturedAt } : {}),
						views: s.views,
						coins: s.coins,
						likes: s.likes,
						favorites: s.favorites,
						shares: s.shares,
						danmakus: s.danmakus,
						replies: s.replies,
					}))
				)
				// A retried batch re-delivers rows that were already written.
				.onConflictDoNothing({
					target: [videoSnapshot.aid, videoSnapshot.capturedAt],
				})
				.returning({ aid: videoSnapshot.aid });
			return inserted.length;
		});
	}

	async getLatestSnapshot(aid: bigint): Promise<LatestVideoSnapshot | null> {
		return this.trace("snapshot.getLatestSnapshot", async () => {
			const [row] = await activeDatabase(this.db)
				.select()
				.from(latestVideoSnapshot)
				.where(eq(latestVideoSnapshot.aid, aid))
				.limit(1);
			return row ?? null;
		});
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return this.trace("snapshot.getRecentSnapshots", () =>
			activeDatabase(this.db)
				.select()
				.from(videoSnapshot)
				.where(eq(videoSnapshot.aid, aid))
				.orderBy(desc(videoSnapshot.capturedAt))
				.limit(limit)
		);
	}

	async getSchedulingHistories(
		aids: bigint[],
		at: Temporal.Instant
	): Promise<Map<bigint, VideoSnapshot[]>> {
		if (aids.length === 0) return new Map();
		return this.trace("snapshot.getSchedulingHistories", async () => {
			const db = activeDatabase(this.db);
			const sevenDaysAgoIso = new Date(
				at.epochMilliseconds - 7 * 24 * 60 * 60 * 1000
			).toISOString();
			const uniqueAids = [...new Set(aids)];
			const aidsArray = sql.join(
				uniqueAids.map((id) => sql`${id}::bigint`),
				sql`, `
			);
			const cutoffsArray = sql.join(
				MILESTONE_HISTORY_WINDOWS_MS.map(
					(windowMs) =>
						sql`${new Date(at.epochMilliseconds - windowMs).toISOString()}::timestamptz`
				),
				sql`, `
			);

			const rows = (await db.execute(sql`
				SELECT DISTINCT ON (s.aid, s.captured_at)
					s.aid,
					s.captured_at,
					s.views,
					s.coins,
					s.likes,
					s.favorites,
					s.shares,
					s.danmakus,
					s.replies
				FROM unnest(ARRAY[${aidsArray}]) AS a(aid)
				CROSS JOIN unnest(ARRAY[${cutoffsArray}]) AS w(cutoff)
				CROSS JOIN LATERAL (
					SELECT
						vs.aid,
						vs.captured_at,
						vs.views,
						vs.coins,
						vs.likes,
						vs.favorites,
						vs.shares,
						vs.danmakus,
						vs.replies
					FROM public.video_snapshot vs
					WHERE vs.aid = a.aid
						AND vs.captured_at >= ${sevenDaysAgoIso}::timestamptz
						AND vs.captured_at <= w.cutoff
					ORDER BY vs.captured_at DESC
					LIMIT 1
				) s
				ORDER BY s.aid, s.captured_at DESC
			`)) as unknown as RawSnapshotRow[];

			const byAid = new Map<bigint, VideoSnapshot[]>();
			for (const row of rows) {
				const snap = toVideoSnapshot(row);
				let list = byAid.get(snap.aid);
				if (!list) {
					list = [];
					byAid.set(snap.aid, list);
				}
				list.push(snap);
			}
			return byAid;
		});
	}

	async getSchedulingHistory(aid: bigint, at: Temporal.Instant): Promise<VideoSnapshot[]> {
		const histories = await this.getSchedulingHistories([aid], at);
		return histories.get(aid) ?? [];
	}

	async listSnapshots(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: VideoSnapshot[]; total: number }> {
		return this.trace("snapshot.listSnapshots", async () => {
			const db = activeDatabase(this.db);
			const items = await db
				.select()
				.from(videoSnapshot)
				.where(eq(videoSnapshot.aid, aid))
				.orderBy(desc(videoSnapshot.capturedAt))
				.limit(options.limit + 1)
				.offset(options.offset);

			const hasMore = items.length > options.limit;
			const pageItems = hasMore ? items.slice(0, options.limit) : items;

			if (!hasMore && options.offset === 0) {
				return { items: pageItems, total: pageItems.length };
			}

			const [tracking] = await db
				.select({ firstCapturedAt: videoTracking.firstCapturedAt })
				.from(videoTracking)
				.where(eq(videoTracking.aid, aid))
				.limit(1);

			const conditions = [eq(videoSnapshot.aid, aid)];
			if (tracking?.firstCapturedAt) {
				conditions.push(gte(videoSnapshot.capturedAt, tracking.firstCapturedAt));
			}

			const [{ total }] = await db
				.select({ total: count() })
				.from(videoSnapshot)
				.where(and(...conditions));

			return { items: pageItems, total };
		});
	}
}
