#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/1cb001ad7cdc68dacbfb4f9776f9b83d927ff7ac65048c883ef69dd906e3c89f/contract';
import endContract from '../../snapshots/1cb001ad7cdc68dacbfb4f9776f9b83d927ff7ac65048c883ef69dd906e3c89f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'bilibili_video_metadata',
        columns: [
          col('aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('bvid', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('captured_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('cid', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('copyright', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('ctime', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('desc_v2', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('dimension', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('discovery_source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('duration', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('dynamic', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('filter_decision', 'text', {
            notNull: true,
            default: lit('accepted'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('honor_reply', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('mid', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('model_score', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('model_version', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('owner_face', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('owner_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('pages', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('pic', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('pubdate', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('rights', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('staff', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('state', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tags', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('tid', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('tid_v2', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tname', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tname_v2', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('video_status', 'text', {
            notNull: true,
            default: lit('normal'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('videos', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['aid'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'bilibili_video_metadata_history',
        columns: [
          col('aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('captured_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('change_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('changed_fields', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'BIGSERIAL', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('snapshot', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'bilibili_video_relation',
        columns: [
          col('captured_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source_aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('target_aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['source_aid', 'target_aid', 'captured_at'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'crawler_runtime_config',
        columns: [
          col('config', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'crawler_stats_rollup',
        columns: [
          col('bucket_time', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('metric_group', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metrics', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
        ],
        constraints: [primaryKey(['bucket_time', 'metric_group'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'discovery_sample',
        columns: [
          col('aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('bvid', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('decision', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('human_label', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('labeled_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('model_version', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('probabilities', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('song_probability', 'float8', {
            notNull: true,
            codecRef: { codecId: 'pg/float8@1' },
          }),
          col('tags', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['aid'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'network_runtime_config',
        columns: [
          col('config', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', {
            notNull: true,
            default: lit('default'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('revision', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'video_snapshot',
        columns: [
          col('aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('captured_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('coins', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('danmakus', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('favorites', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('likes', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('replies', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('shares', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('views', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['aid', 'captured_at'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'video_tracking',
        columns: [
          col('aid', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('consecutive_fails', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('eta_hours', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('last_captured_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('last_error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('last_views', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('lease_until', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('next_metadata_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('next_snapshot_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('priority', 'int4', {
            notNull: true,
            default: lit(2),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('published_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('schedule_reason', 'text', {
            notNull: true,
            default: lit('regular'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('state', 'text', {
            notNull: true,
            default: lit('regular'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('target_milestone', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('velocity', 'float8', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/float8@1' },
          }),
        ],
        constraints: [primaryKey(['aid'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata',
        index: 'bilibili_video_metadata_bvid_idx_c12e1092',
        columns: ['bvid'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata',
        index: 'bilibili_video_metadata_filter_decision_idx_27d2a765',
        columns: ['filter_decision'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata',
        index: 'bilibili_video_metadata_mid_idx_f4dbf00d',
        columns: ['mid'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata',
        index: 'bilibili_video_metadata_pubdate_idx_0fd30c15',
        columns: ['pubdate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata',
        index: 'bilibili_video_metadata_video_status_idx_d4de8f7b',
        columns: ['video_status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata_history',
        index: 'bilibili_video_metadata_history_aid_captured_at_idx_dcdef075',
        columns: ['aid', 'captured_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_metadata_history',
        index: 'bilibili_video_metadata_history_captured_at_idx_d9a9e270',
        columns: ['captured_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_relation',
        index: 'bilibili_video_relation_captured_at_idx_d9a9e270',
        columns: ['captured_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_relation',
        index: 'bilibili_video_relation_source_aid_captured_at_idx_ae145c84',
        columns: ['source_aid', 'captured_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bilibili_video_relation',
        index: 'bilibili_video_relation_target_aid_idx_89f38e54',
        columns: ['target_aid'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'crawler_stats_rollup',
        index: 'crawler_stats_rollup_metric_group_bucket_time_idx_e6e915ef',
        columns: ['metric_group', 'bucket_time'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'discovery_sample',
        index: 'discovery_sample_created_at_idx_225d8c0f',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'discovery_sample',
        index: 'discovery_sample_decision_idx_cb87c9d6',
        columns: ['decision'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'discovery_sample',
        index: 'discovery_sample_human_label_idx_a828fb63',
        columns: ['human_label'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'video_snapshot',
        index: 'video_snapshot_captured_at_idx_d9a9e270',
        columns: ['captured_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'video_tracking',
        index: 'video_tracking_lease_until_idx_f9b7ab83',
        columns: ['lease_until'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'video_tracking',
        index: 'video_tracking_next_metadata_at_idx_675f7bb3',
        columns: ['next_metadata_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'video_tracking',
        index: 'video_tracking_next_snapshot_at_priority_idx_9b21cea1',
        columns: ['next_snapshot_at', 'priority'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
