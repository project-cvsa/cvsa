import { bigint, doublePrecision, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { Temporal } from "temporal-polyfill";
import { temporalInstant } from "../customTypes";

const currentInstant = () => Temporal.Instant.fromEpochMilliseconds(Date.now());

/**
 * One scheduling row per tracked video.
 *
 * `lease_until` is the crawler's optimistic lock: a worker may only claim a row
 * while the lease is null or expired, so two workers never crawl the same video.
 */
export const videoTracking = pgTable(
	"video_tracking",
	{
		aid: bigint("aid", { mode: "bigint" }).primaryKey(),
		state: text("state").notNull().default("regular"),
		nextSnapshotAt: temporalInstant("next_snapshot_at").notNull(),
		leaseUntil: temporalInstant("lease_until"),
		scheduleReason: text("schedule_reason").notNull().default("regular"),
		nextMetadataAt: temporalInstant("next_metadata_at"),
		lastViews: integer("last_views").notNull().default(0),
		lastCapturedAt: temporalInstant("last_captured_at"),
		velocity: doublePrecision("velocity").notNull().default(0),
		targetMilestone: integer("target_milestone"),
		etaHours: doublePrecision("eta_hours"),
		publishedAt: temporalInstant("published_at"),
		priority: integer("priority").notNull().default(2),
		consecutiveFails: integer("consecutive_fails").notNull().default(0),
		lastError: text("last_error"),
		updatedAt: temporalInstant("updated_at")
			.notNull()
			.$defaultFn(currentInstant)
			.$onUpdate(currentInstant),
	},
	(table) => [
		index("video_tracking_lease_until_idx_f9b7ab83").on(table.leaseUntil),
		index("video_tracking_next_metadata_at_idx_675f7bb3").on(table.nextMetadataAt),
		index("video_tracking_next_snapshot_at_priority_idx_9b21cea1").on(
			table.nextSnapshotAt,
			table.priority
		),
	]
);

export type VideoTracking = typeof videoTracking.$inferSelect;
export type VideoTrackingInsert = typeof videoTracking.$inferInsert;
