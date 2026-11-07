import { sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { temporalInstant } from "../customTypes";

/**
 * Engagement samples for a tracked video.
 *
 * Promoted to a TimescaleDB hypertable on `captured_at` by the migration
 * runner, which is also why the primary key has to include the time column.
 */
export const videoSnapshot = pgTable(
	"video_snapshot",
	{
		aid: bigint("aid", { mode: "bigint" }).notNull(),
		capturedAt: temporalInstant("captured_at").notNull().default(sql`now()`),
		views: integer("views").notNull(),
		coins: integer("coins").notNull(),
		likes: integer("likes").notNull(),
		favorites: integer("favorites").notNull(),
		shares: integer("shares").notNull(),
		danmakus: integer("danmakus").notNull(),
		replies: integer("replies").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.aid, table.capturedAt] }),
		index("video_snapshot_captured_at_idx_d9a9e270").on(table.capturedAt),
	]
);

export const latestVideoSnapshot = pgTable(
	"latest_video_snapshot",
	{
		aid: bigint("aid", { mode: "bigint" }).primaryKey(),
		capturedAt: temporalInstant("captured_at").notNull().default(sql`now()`),
		views: integer("views").notNull(),
		coins: integer("coins").notNull().default(0),
		likes: integer("likes").notNull().default(0),
		favorites: integer("favorites").notNull().default(0),
		shares: integer("shares").notNull().default(0),
		danmakus: integer("danmakus").notNull().default(0),
		replies: integer("replies").notNull().default(0),
	},
	(table) => [
		index("latest_video_snapshot_views_idx").on(table.views),
		index("latest_video_snapshot_captured_at_idx").on(table.capturedAt),
	]
);

export type VideoSnapshot = typeof videoSnapshot.$inferSelect;
export type VideoSnapshotInsert = typeof videoSnapshot.$inferInsert;
export type LatestVideoSnapshot = typeof latestVideoSnapshot.$inferSelect;
export type LatestVideoSnapshotInsert = typeof latestVideoSnapshot.$inferInsert;
