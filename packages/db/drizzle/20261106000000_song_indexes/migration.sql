CREATE INDEX IF NOT EXISTS "song_bilibili_aid_idx" ON "core"."song" ("bilibili_aid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_published_at_idx" ON "core"."song" ("published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_type_idx" ON "core"."song" ("type");
