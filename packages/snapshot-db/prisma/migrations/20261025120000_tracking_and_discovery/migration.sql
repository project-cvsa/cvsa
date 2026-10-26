-- Video tracking table for adaptive scheduling engine
CREATE TABLE IF NOT EXISTS "video_tracking" (
	"aid" BIGINT NOT NULL,
	"state" VARCHAR(32) NOT NULL DEFAULT 'regular',
	"next_snapshot_at" TIMESTAMPTZ(6) NOT NULL,
	"last_views" INTEGER NOT NULL DEFAULT 0,
	"last_captured_at" TIMESTAMPTZ(6),
	"velocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
	"target_milestone" INTEGER,
	"eta_hours" DOUBLE PRECISION,
	"published_at" TIMESTAMPTZ(6),
	"priority" INTEGER NOT NULL DEFAULT 2,
	"consecutive_fails" INTEGER NOT NULL DEFAULT 0,
	"updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "video_tracking_pkey" PRIMARY KEY ("aid")
);

CREATE INDEX IF NOT EXISTS "video_tracking_next_snapshot_at_priority_idx"
	ON "video_tracking" ("next_snapshot_at", "priority");

-- Rich video metadata archiving table
CREATE TABLE IF NOT EXISTS "bilibili_video_metadata" (
	"aid" BIGINT NOT NULL,
	"bvid" VARCHAR(32) NOT NULL,
	"title" TEXT NOT NULL,
	"description" TEXT,
	"pic" TEXT,
	"pubdate" TIMESTAMPTZ(6),
	"duration" INTEGER NOT NULL DEFAULT 0,
	"mid" BIGINT,
	"owner_name" TEXT,
	"owner_face" TEXT,
	"tid" INTEGER,
	"tname" TEXT,
	"copyright" INTEGER,
	"tags" JSONB,
	"raw_payload" JSONB,
	"captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "bilibili_video_metadata_pkey" PRIMARY KEY ("aid")
);

CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_bvid_idx" ON "bilibili_video_metadata" ("bvid");
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_mid_idx" ON "bilibili_video_metadata" ("mid");
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_pubdate_idx" ON "bilibili_video_metadata" ("pubdate");

-- Bilibili video recommendation relation graph table
CREATE TABLE IF NOT EXISTS "bilibili_video_relation" (
	"source_aid" BIGINT NOT NULL,
	"target_aid" BIGINT NOT NULL,
	"position" INTEGER NOT NULL,
	"captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "bilibili_video_relation_pkey" PRIMARY KEY ("source_aid", "target_aid", "captured_at")
);

CREATE INDEX IF NOT EXISTS "bilibili_video_relation_source_aid_captured_at_idx"
	ON "bilibili_video_relation" ("source_aid", "captured_at");
CREATE INDEX IF NOT EXISTS "bilibili_video_relation_target_aid_idx"
	ON "bilibili_video_relation" ("target_aid");
CREATE INDEX IF NOT EXISTS "bilibili_video_relation_captured_at_idx"
	ON "bilibili_video_relation" ("captured_at");
