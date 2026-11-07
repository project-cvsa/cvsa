CREATE SCHEMA IF NOT EXISTS "extensions";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "extensions" TO PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
		ALTER EXTENSION "pg_stat_statements" SET SCHEMA "extensions";
	ELSE
		CREATE EXTENSION "pg_stat_statements" WITH SCHEMA "extensions";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
		ALTER EXTENSION "pg_trgm" SET SCHEMA "extensions";
	ELSE
		CREATE EXTENSION "pg_trgm" WITH SCHEMA "extensions";
	END IF;
	EXECUTE format('ALTER DATABASE %I SET search_path TO "$user", public, extensions', current_database());
END $$;
--> statement-breakpoint
SET search_path TO "$user", public, extensions;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_updated_at_aid_idx" ON "video_tracking" ("updated_at", "aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_state_updated_at_idx" ON "video_tracking" ("state", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_last_views_aid_idx" ON "video_tracking" ("last_views", "aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_published_at_aid_idx" ON "video_tracking" ("published_at", "aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_consecutive_fails_idx" ON "video_tracking" ("consecutive_fails");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_tracking_last_captured_at_idx" ON "video_tracking" ("last_captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_discovery_source_aid_idx" ON "bilibili_video_metadata" ("discovery_source", "aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bilibili_video_metadata_title_trgm_idx" ON "bilibili_video_metadata" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_sample_labeled_at_idx" ON "discovery_sample" ("labeled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_sample_song_probability_aid_idx" ON "discovery_sample" ("song_probability", "aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_sample_title_trgm_idx" ON "discovery_sample" USING gin ("title" gin_trgm_ops);
