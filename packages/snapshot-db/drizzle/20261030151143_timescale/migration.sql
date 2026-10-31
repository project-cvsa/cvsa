-- TimescaleDB promotion for the engagement samples.
--
-- This cannot be expressed in the Drizzle schema document: `create_hypertable`
-- rewrites the table's storage and compression settings live outside the
-- catalog that Drizzle diffs.
--
-- Every statement is idempotent, so applying it to a database that was already
-- promoted by the previous toolchain is a no-op.
CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
SELECT create_hypertable('video_snapshot', 'captured_at', if_not_exists => TRUE);
--> statement-breakpoint
ALTER TABLE "video_snapshot" SET (
	timescaledb.compress,
	timescaledb.compress_segmentby = 'aid',
	timescaledb.compress_orderby = 'captured_at DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('video_snapshot', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint
SELECT remove_retention_policy('video_snapshot', if_exists => TRUE);
