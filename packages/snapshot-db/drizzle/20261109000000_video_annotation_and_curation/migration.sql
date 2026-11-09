CREATE TABLE IF NOT EXISTS "video_annotation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"aid" bigint NOT NULL,
	"bvid" text NOT NULL,
	"user_id" text NOT NULL,
	"decision" text NOT NULL,
	"tags" json,
	"notes" text,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_annotation_aid_created_at_idx" ON "video_annotation" ("aid", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_annotation_user_id_created_at_idx" ON "video_annotation" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_annotation_created_at_idx" ON "video_annotation" ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_curation" (
	"aid" bigint PRIMARY KEY,
	"bvid" text NOT NULL,
	"status" text NOT NULL,
	"curated_by" text NOT NULL,
	"reason" text,
	"curated_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_curation_status_updated_at_idx" ON "video_curation" ("status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_curation_curated_at_idx" ON "video_curation" ("curated_at");
