import { index, integer, json, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
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

export const crawlerStatsMinute = pgTable(
	"crawler_stats_minute",
	{
		bucketTime: temporalInstant("bucket_time").notNull(),
		sourceId: text("source_id").notNull(),
		metrics: json("metrics").notNull(),
	},
	(table) => [primaryKey({ columns: [table.bucketTime, table.sourceId] })]
);
export type CrawlerStatsMinute = typeof crawlerStatsMinute.$inferSelect;

/** One crawler process lifetime, used to reason about coverage and liveness. */
export const crawlerStatsInstance = pgTable("crawler_stats_instance", {
	instanceId: text("instance_id").primaryKey(),
	startedAt: temporalInstant("started_at").notNull(),
	exitedAt: temporalInstant("exited_at"),
	lastPersistedAt: temporalInstant("last_persisted_at").notNull(),
	coveredTo: temporalInstant("covered_to").notNull(),
	formatVersion: integer("format_version").notNull(),
});

export type CrawlerStatsInstanceRow = typeof crawlerStatsInstance.$inferSelect;
export type CrawlerStatsInstanceInsert = typeof crawlerStatsInstance.$inferInsert;

/** Instance + hour aggregate, recomputed from complete minutes. */
export const crawlerStatsHour = pgTable(
	"crawler_stats_hour",
	{
		hourTime: temporalInstant("hour_time").notNull(),
		sourceId: text("source_id").notNull(),
		formatVersion: integer("format_version").notNull(),
		metrics: json("metrics").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.hourTime, table.sourceId] }),
		index("crawler_stats_hour_source_time_idx").on(table.sourceId, table.hourTime),
	]
);

export type CrawlerStatsHour = typeof crawlerStatsHour.$inferSelect;

/** Dirty marker for an instance hour; generation guards concurrent recomputation. */
export const crawlerStatsHourPending = pgTable(
	"crawler_stats_hour_pending",
	{
		hourTime: temporalInstant("hour_time").notNull(),
		sourceId: text("source_id").notNull(),
		generation: integer("generation").notNull(),
		updatedAt: temporalInstant("updated_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.hourTime, table.sourceId] })]
);

/** Sampled current state; one row per item, scope and 30-second slot. */
export const crawlerStatsState = pgTable(
	"crawler_stats_state",
	{
		sampledAt: temporalInstant("sampled_at").notNull(),
		scope: text("scope").notNull(),
		item: text("item").notNull(),
		formatVersion: integer("format_version").notNull(),
		status: text("status").notNull(),
		data: json("data").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.sampledAt, table.scope, table.item] }),
		index("crawler_stats_state_scope_item_time_idx").on(
			table.scope,
			table.item,
			table.sampledAt
		),
	]
);

export type CrawlerStatsStateRow = typeof crawlerStatsState.$inferSelect;

/** Per-metric activation instant; ranges before it are reported as partial. */
export const crawlerStatsMetricAvailability = pgTable("crawler_stats_metric_availability", {
	metric: text("metric").primaryKey(),
	enabledAt: temporalInstant("enabled_at").notNull(),
});

export type CrawlerStatsMetricAvailabilityRow = typeof crawlerStatsMetricAvailability.$inferSelect;
