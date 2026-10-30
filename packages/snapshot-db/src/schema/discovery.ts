import { sql } from "drizzle-orm";
import { bigint, doublePrecision, index, integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { temporalInstant } from "../customTypes";

/** Classifier output kept for threshold tuning and manual labelling. */
export const discoverySample = pgTable(
	"discovery_sample",
	{
		aid: bigint("aid", { mode: "bigint" }).primaryKey(),
		bvid: text("bvid").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		tags: json("tags"),
		decision: text("decision").notNull(),
		modelVersion: text("model_version").notNull(),
		probabilities: json("probabilities").notNull(),
		songProbability: doublePrecision("song_probability").notNull(),
		humanLabel: integer("human_label"),
		labeledAt: temporalInstant("labeled_at"),
		createdAt: temporalInstant("created_at").notNull().default(sql`now()`),
	},
	(table) => [
		index("discovery_sample_created_at_idx_225d8c0f").on(table.createdAt),
		index("discovery_sample_decision_idx_cb87c9d6").on(table.decision),
		index("discovery_sample_human_label_idx_a828fb63").on(table.humanLabel),
	]
);

export type DiscoverySample = typeof discoverySample.$inferSelect;
export type DiscoverySampleInsert = typeof discoverySample.$inferInsert;
