-- The crawler owns this database. It must never share the primary CVSA schema.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS "video_snapshot" (
	"aid" BIGINT NOT NULL,
	"captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"views" INTEGER NOT NULL,
	"coins" INTEGER NOT NULL,
	"likes" INTEGER NOT NULL,
	"favorites" INTEGER NOT NULL,
	"shares" INTEGER NOT NULL,
	"danmakus" INTEGER NOT NULL,
	"replies" INTEGER NOT NULL,

	CONSTRAINT "video_snapshot_pkey" PRIMARY KEY ("aid", "captured_at")
);

SELECT create_hypertable('video_snapshot', 'captured_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS "video_snapshot_aid_captured_at_idx"
	ON "video_snapshot" ("aid", "captured_at" DESC);
