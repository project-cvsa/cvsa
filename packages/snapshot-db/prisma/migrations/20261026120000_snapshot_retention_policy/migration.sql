-- Configure lossless compression on the snapshot hypertable.
--
-- Every tracked video is sampled on a schedule, so `video_snapshot` grows
-- over time. Chunks older than 7 days are compressed (segmented by aid,
-- ordered newest first), which reduces storage footprint while preserving
-- all historical archive data permanently.

ALTER TABLE "video_snapshot" SET (
	timescaledb.compress,
	timescaledb.compress_segmentby = 'aid',
	timescaledb.compress_orderby = 'captured_at DESC'
);

SELECT add_compression_policy('video_snapshot', INTERVAL '7 days', if_not_exists => TRUE);

