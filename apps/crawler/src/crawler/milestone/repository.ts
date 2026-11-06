import { and, asc, eq, gt, gte, lte, sql } from "drizzle-orm";
import {
	latestVideoSnapshot,
	videoMilestone,
	videoSnapshot,
	milestoneRecoveryCandidate,
	toInstant,
	type DatabaseClient,
	type VideoMilestone,
	type VideoMilestoneInsert,
} from "@cvsa/snapshot-db";
import { activeDatabase } from "../shared/databaseContext";

export interface MilestoneSample {
	at: string;
	views: number;
}
export interface IMilestoneRepository {
	list(aid: bigint): Promise<VideoMilestone[]>;
	insert(rows: VideoMilestoneInsert[]): Promise<number>;
	prepareRecovery(id: string, minimumViews: number, through: string): Promise<void>;
	nextCandidate(id: string, afterAid: bigint): Promise<bigint | null>;
	finishRecovery(id: string): Promise<void>;
	trace(
		aid: bigint,
		from: string,
		to: string,
		limit: number,
		after?: string
	): Promise<MilestoneSample[]>;
}

export class MilestoneRepository implements IMilestoneRepository {
	constructor(private readonly db: DatabaseClient) {}
	list(aid: bigint): Promise<VideoMilestone[]> {
		return activeDatabase(this.db)
			.select()
			.from(videoMilestone)
			.where(eq(videoMilestone.aid, aid))
			.orderBy(asc(videoMilestone.threshold), asc(videoMilestone.at));
	}
	async insert(rows: VideoMilestoneInsert[]): Promise<number> {
		if (rows.length === 0) return 0;
		return (
			await activeDatabase(this.db)
				.insert(videoMilestone)
				.values(rows)
				.onConflictDoNothing()
				.returning({ aid: videoMilestone.aid })
		).length;
	}
	async prepareRecovery(id: string, minimumViews: number, through: string): Promise<void> {
		await activeDatabase(
			this.db
		).execute(sql`INSERT INTO ${milestoneRecoveryCandidate} (recovery_id, aid)
			SELECT ${id}::uuid, ${latestVideoSnapshot.aid} FROM ${latestVideoSnapshot}
			WHERE ${latestVideoSnapshot.views} >= ${minimumViews} AND ${latestVideoSnapshot.capturedAt} <= ${through}::timestamptz
			ON CONFLICT DO NOTHING`);
	}
	async nextCandidate(id: string, afterAid: bigint): Promise<bigint | null> {
		const [row] = await activeDatabase(this.db)
			.select({ aid: milestoneRecoveryCandidate.aid })
			.from(milestoneRecoveryCandidate)
			.where(
				and(
					eq(milestoneRecoveryCandidate.recoveryId, id),
					gt(milestoneRecoveryCandidate.aid, afterAid)
				)
			)
			.orderBy(asc(milestoneRecoveryCandidate.aid))
			.limit(1);
		return row?.aid ?? null;
	}
	async finishRecovery(id: string): Promise<void> {
		await activeDatabase(this.db)
			.delete(milestoneRecoveryCandidate)
			.where(eq(milestoneRecoveryCandidate.recoveryId, id));
	}
	async trace(
		aid: bigint,
		from: string,
		to: string,
		limit: number,
		after?: string
	): Promise<MilestoneSample[]> {
		const rows = await activeDatabase(this.db)
			.select({ at: videoSnapshot.capturedAt, views: videoSnapshot.views })
			.from(videoSnapshot)
			.where(
				and(
					eq(videoSnapshot.aid, aid),
					gte(videoSnapshot.capturedAt, toInstant(new Date(from))),
					lte(videoSnapshot.capturedAt, toInstant(new Date(to))),
					after ? gt(videoSnapshot.capturedAt, toInstant(new Date(after))) : undefined
				)
			)
			.orderBy(asc(videoSnapshot.capturedAt))
			.limit(limit);
		return rows.map((row) => ({ at: row.at.toString(), views: row.views }));
	}
}
