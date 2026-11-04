CREATE TABLE IF NOT EXISTS "crawler_stats_instance" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"exited_at" timestamp with time zone,
	"last_persisted_at" timestamp with time zone NOT NULL,
	"covered_to" timestamp with time zone NOT NULL,
	"format_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_stats_hour" (
	"hour_time" timestamp with time zone NOT NULL,
	"source_id" text NOT NULL,
	"format_version" integer NOT NULL,
	"metrics" json NOT NULL,
	CONSTRAINT "crawler_stats_hour_hour_time_source_id_pk" PRIMARY KEY("hour_time","source_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_stats_hour_source_time_idx" ON "crawler_stats_hour" USING btree ("source_id","hour_time");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_stats_hour_pending" (
	"hour_time" timestamp with time zone NOT NULL,
	"source_id" text NOT NULL,
	"generation" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "crawler_stats_hour_pending_hour_time_source_id_pk" PRIMARY KEY("hour_time","source_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_stats_state" (
	"sampled_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"item" text NOT NULL,
	"format_version" integer NOT NULL,
	"status" text NOT NULL,
	"data" json NOT NULL,
	CONSTRAINT "crawler_stats_state_sampled_at_scope_item_pk" PRIMARY KEY("sampled_at","scope","item")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_stats_state_scope_item_time_idx" ON "crawler_stats_state" USING btree ("scope","item","sampled_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_stats_metric_availability" (
	"metric" text PRIMARY KEY NOT NULL,
	"enabled_at" timestamp with time zone NOT NULL
);
