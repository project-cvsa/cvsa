CREATE TABLE IF NOT EXISTS "discovery_search_window" (
	"keyword" text NOT NULL,
	"window_start" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_search_window_keyword_window_start_pk" PRIMARY KEY("keyword","window_start")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_search_window_keyword_idx" ON "discovery_search_window" USING btree ("keyword");
