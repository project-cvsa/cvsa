-- 1. Remove any retention policy on video_snapshot so archive snapshots are kept permanently
SELECT remove_retention_policy('video_snapshot', if_exists => TRUE);

-- 2. Extend video_tracking with lease lock, schedule reason, metadata refresh schedule, and error tracking
ALTER TABLE "video_tracking"
	ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ(6),
	ADD COLUMN IF NOT EXISTS "schedule_reason" VARCHAR(64) NOT NULL DEFAULT 'regular',
	ADD COLUMN IF NOT EXISTS "next_metadata_at" TIMESTAMPTZ(6),
	ADD COLUMN IF NOT EXISTS "last_error" TEXT;

CREATE INDEX IF NOT EXISTS "video_tracking_lease_until_idx" ON "video_tracking" ("lease_until");
CREATE INDEX IF NOT EXISTS "video_tracking_next_metadata_at_idx" ON "video_tracking" ("next_metadata_at");

-- 3. Expand bilibili_video_metadata to store full structured Bilibili View/Tags fields and remove raw_payload
ALTER TABLE "bilibili_video_metadata"
	DROP COLUMN IF EXISTS "raw_payload",
	ADD COLUMN IF NOT EXISTS "cid" BIGINT,
	ADD COLUMN IF NOT EXISTS "videos" INTEGER NOT NULL DEFAULT 1,
	ADD COLUMN IF NOT EXISTS "tid_v2" INTEGER,
	ADD COLUMN IF NOT EXISTS "tname_v2" TEXT,
	ADD COLUMN IF NOT EXISTS "ctime" TIMESTAMPTZ(6),
	ADD COLUMN IF NOT EXISTS "desc_v2" JSONB,
	ADD COLUMN IF NOT EXISTS "state" INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS "dynamic" TEXT,
	ADD COLUMN IF NOT EXISTS "dimension" JSONB,
	ADD COLUMN IF NOT EXISTS "pages" JSONB,
	ADD COLUMN IF NOT EXISTS "staff" JSONB,
	ADD COLUMN IF NOT EXISTS "rights" JSONB,
	ADD COLUMN IF NOT EXISTS "honor_reply" JSONB,
	ADD COLUMN IF NOT EXISTS "video_status" VARCHAR(32) NOT NULL DEFAULT 'normal',
	ADD COLUMN IF NOT EXISTS "filter_decision" VARCHAR(32) NOT NULL DEFAULT 'accepted',
	ADD COLUMN IF NOT EXISTS "model_score" DOUBLE PRECISION,
	ADD COLUMN IF NOT EXISTS "model_version" VARCHAR(64),
	ADD COLUMN IF NOT EXISTS "discovery_source" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_video_status_idx" ON "bilibili_video_metadata" ("video_status");
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_filter_decision_idx" ON "bilibili_video_metadata" ("filter_decision");

-- 4. Create bilibili_video_metadata_history for tracking metadata revisions and diffs
CREATE TABLE IF NOT EXISTS "bilibili_video_metadata_history" (
	"id" BIGSERIAL NOT NULL,
	"aid" BIGINT NOT NULL,
	"captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"change_type" VARCHAR(32) NOT NULL,
	"changed_fields" JSONB NOT NULL,
	"snapshot" JSONB NOT NULL,

	CONSTRAINT "bilibili_video_metadata_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_history_aid_captured_at_idx"
	ON "bilibili_video_metadata_history" ("aid", "captured_at");
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_history_captured_at_idx"
	ON "bilibili_video_metadata_history" ("captured_at");

-- 5. Create crawler_runtime_config for persisted tracking/discovery/schedule/model configurations
CREATE TABLE IF NOT EXISTS "crawler_runtime_config" (
	"key" VARCHAR(64) NOT NULL,
	"revision" INTEGER NOT NULL DEFAULT 1,
	"config" JSONB NOT NULL,
	"updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "crawler_runtime_config_pkey" PRIMARY KEY ("key")
);

-- 6. Create discovery_sample for storing model-evaluated samples and human labels
CREATE TABLE IF NOT EXISTS "discovery_sample" (
	"aid" BIGINT NOT NULL,
	"bvid" VARCHAR(32) NOT NULL,
	"title" TEXT NOT NULL,
	"description" TEXT,
	"tags" JSONB,
	"decision" VARCHAR(32) NOT NULL,
	"model_version" VARCHAR(64) NOT NULL,
	"probabilities" JSONB NOT NULL,
	"song_probability" DOUBLE PRECISION NOT NULL,
	"human_label" INTEGER,
	"labeled_at" TIMESTAMPTZ(6),
	"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "discovery_sample_pkey" PRIMARY KEY ("aid")
);

CREATE INDEX IF NOT EXISTS "discovery_sample_decision_idx" ON "discovery_sample" ("decision");
CREATE INDEX IF NOT EXISTS "discovery_sample_human_label_idx" ON "discovery_sample" ("human_label");
CREATE INDEX IF NOT EXISTS "discovery_sample_created_at_idx" ON "discovery_sample" ("created_at");

-- 7. Create crawler_stats_rollup for minute-level throughput, error rate, and backlog statistics
CREATE TABLE IF NOT EXISTS "crawler_stats_rollup" (
	"bucket_time" TIMESTAMPTZ(6) NOT NULL,
	"metric_group" VARCHAR(64) NOT NULL,
	"metrics" JSONB NOT NULL,

	CONSTRAINT "crawler_stats_rollup_pkey" PRIMARY KEY ("bucket_time", "metric_group")
);

CREATE INDEX IF NOT EXISTS "crawler_stats_rollup_metric_group_bucket_time_idx"
	ON "crawler_stats_rollup" ("metric_group", "bucket_time");
