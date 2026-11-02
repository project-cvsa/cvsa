CREATE TABLE IF NOT EXISTS "crawler_stats_minute" (
	"bucket_time" timestamp with time zone NOT NULL,
	"source_id" text NOT NULL,
	"metrics" json NOT NULL,
	CONSTRAINT "crawler_stats_minute_bucket_time_source_id_pk" PRIMARY KEY ("bucket_time", "source_id")
);
