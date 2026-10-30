import { index, json, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { temporalInstant } from "../customTypes";

/** Pre-aggregated crawler metrics, one row per bucket and metric group. */
export const crawlerStatsRollup = pgTable(
	"crawler_stats_rollup",
	{
		bucketTime: temporalInstant("bucket_time").notNull(),
		metricGroup: text("metric_group").notNull(),
		metrics: json("metrics").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.bucketTime, table.metricGroup] }),
		index("crawler_stats_rollup_metric_group_bucket_time_idx_e6e915ef").on(
			table.metricGroup,
			table.bucketTime
		),
	]
);

export type CrawlerStatsRollup = typeof crawlerStatsRollup.$inferSelect;
export type CrawlerStatsRollupInsert = typeof crawlerStatsRollup.$inferInsert;
