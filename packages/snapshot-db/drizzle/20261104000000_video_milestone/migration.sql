ALTER TABLE "video_tracking" ADD COLUMN "eligible_at" timestamptz;
--> statement-breakpoint
CREATE TABLE "video_milestone" (
	"aid" bigint NOT NULL,
	"threshold" integer NOT NULL,
	"source" text NOT NULL,
	"time_kind" text NOT NULL,
	"at" timestamptz NOT NULL,
	"views" integer,
	"previous_at" timestamptz,
	"previous_views" integer,
	"scheduled_at" timestamptz,
	"request_started_at" timestamptz,
	"note" text,
	"recorded_at" timestamptz DEFAULT now() NOT NULL,
	PRIMARY KEY ("aid", "threshold", "source", "time_kind", "at"),
	CONSTRAINT "video_milestone_threshold_positive" CHECK ("threshold" > 0),
	CONSTRAINT "video_milestone_views_reached" CHECK ("views" IS NULL OR "views" >= "threshold"),
	CONSTRAINT "video_milestone_source" CHECK ("source" IN ('live', 'history', 'manual')),
	CONSTRAINT "video_milestone_time_kind" CHECK ("time_kind" IN ('observed', 'by', 'exact', 'minute'))
);
--> statement-breakpoint
CREATE INDEX "video_milestone_at_idx" ON "video_milestone" ("at");
--> statement-breakpoint
CREATE TABLE "milestone_recovery_candidate" (
	"recovery_id" uuid NOT NULL,
	"aid" bigint NOT NULL,
	PRIMARY KEY ("recovery_id", "aid")
);
