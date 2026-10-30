import { json, pgTable, text, integer } from "drizzle-orm/pg-core";
import { Temporal } from "temporal-polyfill";
import { temporalInstant } from "../customTypes";

const currentInstant = () => Temporal.Instant.fromEpochMilliseconds(Date.now());

/**
 * Single-row (or per-key) runtime overrides.
 *
 * `revision` is the optimistic concurrency token: an operator edit that was
 * composed against a stale revision is rejected instead of silently winning.
 */
export const networkRuntimeConfig = pgTable("network_runtime_config", {
	id: text("id").primaryKey().default("default"),
	revision: integer("revision").notNull().default(1),
	config: json("config").notNull(),
	updatedAt: temporalInstant("updated_at")
		.notNull()
		.$defaultFn(currentInstant)
		.$onUpdate(currentInstant),
});

export const crawlerRuntimeConfig = pgTable("crawler_runtime_config", {
	key: text("key").primaryKey(),
	revision: integer("revision").notNull().default(1),
	config: json("config").notNull(),
	updatedAt: temporalInstant("updated_at")
		.notNull()
		.$defaultFn(currentInstant)
		.$onUpdate(currentInstant),
});

export type NetworkRuntimeConfig = typeof networkRuntimeConfig.$inferSelect;
export type NetworkRuntimeConfigInsert = typeof networkRuntimeConfig.$inferInsert;
export type CrawlerRuntimeConfig = typeof crawlerRuntimeConfig.$inferSelect;
export type CrawlerRuntimeConfigInsert = typeof crawlerRuntimeConfig.$inferInsert;
