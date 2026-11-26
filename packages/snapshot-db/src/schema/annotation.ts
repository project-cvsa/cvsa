import { sql } from "drizzle-orm";
import { bigint, index, json, pgTable, text } from "drizzle-orm/pg-core";
import { temporalInstant } from "../customTypes";

/**
 * Multi-record annotation history for discovery candidates.
 *
 * Each entry captures an annotator's independent review decision, optional
 * thematic/genre tags, and reviewer notes. Multiple annotators may review
 * the same video without overwriting each other.
 */
export const videoAnnotation = pgTable(
	"video_annotation",
	{
		id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
		aid: bigint("aid", { mode: "bigint" }).notNull(),
		bvid: text("bvid").notNull(),
		userId: text("user_id").notNull(),
		decision: text("decision").notNull(), // 'accepted' | 'rejected' | 'uncertain'
		tags: json("tags").$type<string[]>(),
		notes: text("notes"),
		createdAt: temporalInstant("created_at").notNull().default(sql`now()`),
	},
	(table) => [
		index("video_annotation_aid_created_at_idx").on(table.aid, table.createdAt),
		index("video_annotation_user_id_created_at_idx").on(table.userId, table.createdAt),
		index("video_annotation_created_at_idx").on(table.createdAt),
	]
);

export type VideoAnnotation = typeof videoAnnotation.$inferSelect;
export type VideoAnnotationInsert = typeof videoAnnotation.$inferInsert;

/**
 * Authoritative final curation verdict for a video candidate.
 *
 * When an authorized curator accepts or rejects a candidate, this record is
 * upserted. Acceptance triggers automatic video tracking ingestion, while
 * rejection excludes the video and stops active tracking sweeps.
 */
export const videoCuration = pgTable(
	"video_curation",
	{
		aid: bigint("aid", { mode: "bigint" }).primaryKey(),
		bvid: text("bvid").notNull(),
		status: text("status").notNull(), // 'accepted' | 'rejected' | 'pending'
		curatedBy: text("curated_by").notNull(),
		reason: text("reason"),
		curatedAt: temporalInstant("curated_at").notNull().default(sql`now()`),
		updatedAt: temporalInstant("updated_at").notNull().default(sql`now()`),
	},
	(table) => [
		index("video_curation_status_updated_at_idx").on(table.status, table.updatedAt),
		index("video_curation_curated_at_idx").on(table.curatedAt),
	]
);

export type VideoCuration = typeof videoCuration.$inferSelect;
export type VideoCurationInsert = typeof videoCuration.$inferInsert;
