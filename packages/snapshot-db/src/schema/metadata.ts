import {
	bigint,
	bigserial,
	index,
	integer,
	json,
	pgTable,
	primaryKey,
	doublePrecision,
	text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { temporalInstant } from "../customTypes";

const currentInstant = () => Temporal.Instant.fromEpochMilliseconds(Date.now());

/**
 * Latest known Bilibili payload for a video.
 *
 * Bulk discovery writes insert-only (recommendation payloads are shallow), while
 * detail fetches go through the repository's diffing upsert so a shallow payload
 * can never wipe `pages`/`staff`/`rights`.
 */
export const bilibiliVideoMetadata = pgTable(
	"bilibili_video_metadata",
	{
		aid: bigint("aid", { mode: "bigint" }).primaryKey(),
		bvid: text("bvid").notNull(),
		cid: bigint("cid", { mode: "bigint" }),
		videos: integer("videos").notNull().default(1),
		tid: integer("tid"),
		tidV2: integer("tid_v2"),
		tname: text("tname"),
		tnameV2: text("tname_v2"),
		copyright: integer("copyright"),
		pic: text("pic"),
		title: text("title").notNull(),
		pubdate: temporalInstant("pubdate"),
		ctime: temporalInstant("ctime"),
		description: text("description"),
		descV2: json("desc_v2"),
		state: integer("state").notNull().default(0),
		duration: integer("duration").notNull().default(0),
		Dynamic: text("dynamic"),
		dimension: json("dimension"),
		mid: bigint("mid", { mode: "bigint" }),
		ownerName: text("owner_name"),
		ownerFace: text("owner_face"),
		pages: json("pages"),
		staff: json("staff"),
		rights: json("rights"),
		honorReply: json("honor_reply"),
		tags: json("tags"),
		videoStatus: text("video_status").notNull().default("normal"),
		filterDecision: text("filter_decision").notNull().default("accepted"),
		modelScore: doublePrecision("model_score"),
		modelVersion: text("model_version"),
		discoverySource: text("discovery_source"),
		discoveryContext: json("discovery_context"),
		capturedAt: temporalInstant("captured_at").notNull().default(sql`now()`),
		updatedAt: temporalInstant("updated_at")
			.notNull()
			.$defaultFn(currentInstant)
			.$onUpdate(currentInstant),
	},
	(table) => [
		index("bilibili_video_metadata_bvid_idx_c12e1092").on(table.bvid),
		index("bilibili_video_metadata_filter_decision_idx_27d2a765").on(table.filterDecision),
		index("bilibili_video_metadata_mid_idx_f4dbf00d").on(table.mid),
		index("bilibili_video_metadata_pubdate_idx_0fd30c15").on(table.pubdate),
		index("bilibili_video_metadata_video_status_idx_d4de8f7b").on(table.videoStatus),
	]
);

/** Append-only trail of metadata mutations, one row per detected change. */
export const bilibiliVideoMetadataHistory = pgTable(
	"bilibili_video_metadata_history",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		aid: bigint("aid", { mode: "bigint" }).notNull(),
		capturedAt: temporalInstant("captured_at").notNull().default(sql`now()`),
		changeType: text("change_type").notNull(),
		changedFields: json("changed_fields").notNull(),
		snapshot: json("snapshot").notNull(),
	},
	(table) => [
		index("bilibili_video_metadata_history_aid_captured_at_idx_dcdef075").on(
			table.aid,
			table.capturedAt
		),
		index("bilibili_video_metadata_history_captured_at_idx_d9a9e270").on(table.capturedAt),
	]
);

/** Recommendation graph edge captured at collection time. */
export const bilibiliVideoRelation = pgTable(
	"bilibili_video_relation",
	{
		sourceAid: bigint("source_aid", { mode: "bigint" }).notNull(),
		targetAid: bigint("target_aid", { mode: "bigint" }).notNull(),
		position: integer("position").notNull(),
		capturedAt: temporalInstant("captured_at").notNull().default(sql`now()`),
	},
	(table) => [
		primaryKey({ columns: [table.sourceAid, table.targetAid, table.capturedAt] }),
		index("bilibili_video_relation_captured_at_idx_d9a9e270").on(table.capturedAt),
		index("bilibili_video_relation_source_aid_captured_at_idx_ae145c84").on(
			table.sourceAid,
			table.capturedAt
		),
		index("bilibili_video_relation_target_aid_idx_89f38e54").on(table.targetAid),
	]
);

export type BilibiliVideoMetadata = typeof bilibiliVideoMetadata.$inferSelect;
export type BilibiliVideoMetadataInsert = typeof bilibiliVideoMetadata.$inferInsert;
export type BilibiliVideoMetadataHistory = typeof bilibiliVideoMetadataHistory.$inferSelect;
export type BilibiliVideoMetadataHistoryInsert = typeof bilibiliVideoMetadataHistory.$inferInsert;
export type BilibiliVideoRelation = typeof bilibiliVideoRelation.$inferSelect;
export type BilibiliVideoRelationInsert = typeof bilibiliVideoRelation.$inferInsert;
