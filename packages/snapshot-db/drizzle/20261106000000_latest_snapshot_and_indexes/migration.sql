SELECT set_chunk_time_interval('video_snapshot', INTERVAL '30 days');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latest_video_snapshot" (
	"aid" bigint PRIMARY KEY NOT NULL,
	"captured_at" timestamptz DEFAULT now() NOT NULL,
	"views" integer NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"favorites" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"danmakus" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "latest_video_snapshot_views_idx" ON "latest_video_snapshot" ("views");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "latest_video_snapshot_captured_at_idx" ON "latest_video_snapshot" ("captured_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION update_latest_video_snapshot() RETURNS TRIGGER AS $$
BEGIN
	INSERT INTO latest_video_snapshot (
		aid, captured_at, views, coins, likes, favorites, shares, danmakus, replies
	) VALUES (
		NEW.aid, NEW.captured_at, NEW.views, NEW.coins, NEW.likes, NEW.favorites, NEW.shares, NEW.danmakus, NEW.replies
	)
	ON CONFLICT (aid) DO UPDATE SET
		captured_at = EXCLUDED.captured_at,
		views = EXCLUDED.views,
		coins = EXCLUDED.coins,
		likes = EXCLUDED.likes,
		favorites = EXCLUDED.favorites,
		shares = EXCLUDED.shares,
		danmakus = EXCLUDED.danmakus,
		replies = EXCLUDED.replies
	WHERE latest_video_snapshot.views < EXCLUDED.views
	   OR latest_video_snapshot.captured_at <= EXCLUDED.captured_at;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_latest_video_snapshot'
	) THEN
		CREATE TRIGGER trg_update_latest_video_snapshot
		AFTER INSERT ON video_snapshot
		FOR EACH ROW
		EXECUTE FUNCTION update_latest_video_snapshot();
	END IF;
END;
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "video_tracking_next_snapshot_at_priority_idx_9b21cea1";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_priority_next_snapshot_at_idx" ON "video_tracking" ("priority", "next_snapshot_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_velocity_idx" ON "video_tracking" ("velocity");
--> statement-breakpoint
ALTER TABLE "video_tracking" ADD COLUMN IF NOT EXISTS "first_captured_at" timestamptz;
--> statement-breakpoint
UPDATE "video_tracking"
SET "first_captured_at" = COALESCE("last_captured_at", "published_at", now())
WHERE "first_captured_at" IS NULL;
--> statement-breakpoint
INSERT INTO "latest_video_snapshot" ("aid", "captured_at", "views", "coins", "likes", "favorites", "shares", "danmakus", "replies")
SELECT DISTINCT ON (s.aid) s.aid, s.captured_at, s.views, s.coins, s.likes, s.favorites, s.shares, s.danmakus, s.replies
FROM "video_snapshot" s
WHERE s.captured_at >= now() - INTERVAL '30 days'
ORDER BY s.aid, s.captured_at DESC
ON CONFLICT ("aid") DO NOTHING;
