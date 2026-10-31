-- Initial snapshot schema.
--
-- Every statement is idempotent: databases provisioned by the previous
-- toolchain already contain these tables, and adopting the Drizzle history must
-- not attempt to recreate them.
CREATE TABLE IF NOT EXISTS "crawler_runtime_config" (
	"key" text PRIMARY KEY,
	"revision" integer DEFAULT 1 NOT NULL,
	"config" json NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "network_runtime_config" (
	"id" text PRIMARY KEY DEFAULT 'default',
	"revision" integer DEFAULT 1 NOT NULL,
	"config" json NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovery_sample" (
	"aid" bigint PRIMARY KEY,
	"bvid" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"tags" json,
	"decision" text NOT NULL,
	"model_version" text NOT NULL,
	"probabilities" json NOT NULL,
	"song_probability" double precision NOT NULL,
	"human_label" integer,
	"labeled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bilibili_video_metadata" (
	"aid" bigint PRIMARY KEY,
	"bvid" text NOT NULL,
	"cid" bigint,
	"videos" integer DEFAULT 1 NOT NULL,
	"tid" integer,
	"tid_v2" integer,
	"tname" text,
	"tname_v2" text,
	"copyright" integer,
	"pic" text,
	"title" text NOT NULL,
	"pubdate" timestamp with time zone,
	"ctime" timestamp with time zone,
	"description" text,
	"desc_v2" json,
	"state" integer DEFAULT 0 NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"dynamic" text,
	"dimension" json,
	"mid" bigint,
	"owner_name" text,
	"owner_face" text,
	"pages" json,
	"staff" json,
	"rights" json,
	"honor_reply" json,
	"tags" json,
	"video_status" text DEFAULT 'normal' NOT NULL,
	"filter_decision" text DEFAULT 'accepted' NOT NULL,
	"model_score" double precision,
	"model_version" text,
	"discovery_source" text,
	"discovery_context" json,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bilibili_video_metadata_history" (
	"id" bigserial PRIMARY KEY,
	"aid" bigint NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_type" text NOT NULL,
	"changed_fields" json NOT NULL,
	"snapshot" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bilibili_video_relation" (
	"source_aid" bigint,
	"target_aid" bigint,
	"position" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bilibili_video_relation_pkey" PRIMARY KEY("source_aid","target_aid","captured_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_snapshot" (
	"aid" bigint,
	"captured_at" timestamp with time zone DEFAULT now(),
	"views" integer NOT NULL,
	"coins" integer NOT NULL,
	"likes" integer NOT NULL,
	"favorites" integer NOT NULL,
	"shares" integer NOT NULL,
	"danmakus" integer NOT NULL,
	"replies" integer NOT NULL,
	CONSTRAINT "video_snapshot_pkey" PRIMARY KEY("aid","captured_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_stats_rollup" (
	"bucket_time" timestamp with time zone,
	"metric_group" text,
	"metrics" json NOT NULL,
	CONSTRAINT "crawler_stats_rollup_pkey" PRIMARY KEY("bucket_time","metric_group")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_tracking" (
	"aid" bigint PRIMARY KEY,
	"state" text DEFAULT 'regular' NOT NULL,
	"next_snapshot_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"schedule_reason" text DEFAULT 'regular' NOT NULL,
	"next_metadata_at" timestamp with time zone,
	"last_views" integer DEFAULT 0 NOT NULL,
	"last_captured_at" timestamp with time zone,
	"velocity" double precision DEFAULT 0 NOT NULL,
	"target_milestone" integer,
	"eta_hours" double precision,
	"published_at" timestamp with time zone,
	"priority" integer DEFAULT 2 NOT NULL,
	"consecutive_fails" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_sample_created_at_idx_225d8c0f" ON "discovery_sample" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_sample_decision_idx_cb87c9d6" ON "discovery_sample" ("decision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_sample_human_label_idx_a828fb63" ON "discovery_sample" ("human_label");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_bvid_idx_c12e1092" ON "bilibili_video_metadata" ("bvid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_filter_decision_idx_27d2a765" ON "bilibili_video_metadata" ("filter_decision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_mid_idx_f4dbf00d" ON "bilibili_video_metadata" ("mid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_pubdate_idx_0fd30c15" ON "bilibili_video_metadata" ("pubdate");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_video_status_idx_d4de8f7b" ON "bilibili_video_metadata" ("video_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_history_aid_captured_at_idx_dcdef075" ON "bilibili_video_metadata_history" ("aid","captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_history_captured_at_idx_d9a9e270" ON "bilibili_video_metadata_history" ("captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_relation_captured_at_idx_d9a9e270" ON "bilibili_video_relation" ("captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_relation_source_aid_captured_at_idx_ae145c84" ON "bilibili_video_relation" ("source_aid","captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_relation_target_aid_idx_89f38e54" ON "bilibili_video_relation" ("target_aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_snapshot_captured_at_idx_d9a9e270" ON "video_snapshot" ("captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_stats_rollup_metric_group_bucket_time_idx_e6e915ef" ON "crawler_stats_rollup" ("metric_group","bucket_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_lease_until_idx_f9b7ab83" ON "video_tracking" ("lease_until");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_next_metadata_at_idx_675f7bb3" ON "video_tracking" ("next_metadata_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_next_snapshot_at_priority_idx_9b21cea1" ON "video_tracking" ("next_snapshot_at","priority");
