import {
	bigint,
	check,
	integer,
	pgTable,
	primaryKey,
	text,
	index,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { temporalInstant } from "../customTypes";

export const videoMilestone = pgTable(
	"video_milestone",
	{
		aid: bigint("aid", { mode: "bigint" }).notNull(),
		threshold: integer("threshold").notNull(),
		source: text("source", { enum: ["live", "history", "manual"] }).notNull(),
		timeKind: text("time_kind", { enum: ["observed", "by", "exact", "minute"] }).notNull(),
		at: temporalInstant("at").notNull(),
		views: integer("views"),
		previousAt: temporalInstant("previous_at"),
		previousViews: integer("previous_views"),
		scheduledAt: temporalInstant("scheduled_at"),
		requestStartedAt: temporalInstant("request_started_at"),
		note: text("note"),
		recordedAt: temporalInstant("recorded_at").notNull().default(sql`now()`),
	},
	(table) => [
		primaryKey({
			columns: [table.aid, table.threshold, table.source, table.timeKind, table.at],
		}),
		index("video_milestone_at_idx").on(table.at),
		check("video_milestone_threshold_positive", sql`${table.threshold} > 0`),
		check(
			"video_milestone_views_reached",
			sql`${table.views} IS NULL OR ${table.views} >= ${table.threshold}`
		),
		check("video_milestone_source", sql`${table.source} IN ('live', 'history', 'manual')`),
		check(
			"video_milestone_time_kind",
			sql`${table.timeKind} IN ('observed', 'by', 'exact', 'minute')`
		),
	]
);

export type VideoMilestone = typeof videoMilestone.$inferSelect;
export type VideoMilestoneInsert = typeof videoMilestone.$inferInsert;

export const milestoneRecoveryCandidate = pgTable(
	"milestone_recovery_candidate",
	{
		recoveryId: uuid("recovery_id").notNull(),
		aid: bigint("aid", { mode: "bigint" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.recoveryId, table.aid] })]
);
