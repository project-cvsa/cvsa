#!/usr/bin/env -S bun
import type { Contract as End } from '../../snapshots/731c752b4d28a8ff70f7f1b9245d6314251a0045e481e6cd69cc27a525722cbf/contract';
import endContract from '../../snapshots/731c752b4d28a8ff70f7f1b9245d6314251a0045e481e6cd69cc27a525722cbf/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
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
      this.createSchema({ schema: 'auth' }),
      this.createSchema({ schema: 'core' }),
      this.createSchema({ schema: 'meta' }),
      this.createSchema({ schema: 'platform' }),
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'auth',
        table: 'account',
        columns: [
          col('accessToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('accessTokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('accountId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('idToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('providerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refreshToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('refreshTokenExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('scope', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'auth',
        table: 'session',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip_address', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'auth',
        table: 'user',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('display_username', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email_verified', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('image', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reputation', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('role_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('username', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'auth',
        table: 'verification',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('identifier', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'album',
        columns: [
          col('cover_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'artist',
        columns: [
          col('aliases', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'artist_aliases_elem_not_null_3676266c',
            sql`array_position("aliases", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: 'core',
        table: 'artist_role',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'creation',
        columns: [
          col('artist_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('artist_role_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'group',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'lyrics',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_translated', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('lrc', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('plain_text', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ttml', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'performance',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('singer_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('svs_engine_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('svs_engine_version_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('voicebank_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'singer',
        columns: [
          col('avatar_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'song',
        columns: [
          col('bilibili_aid', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('bilibili_bvid', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cover_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('duration', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('moegirl_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('original_song_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('published_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('vcpedia_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('vocadb_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'song_type_check_f4a93cc7',
            sql`"type" IN ('ORIGINAL', 'COVER', 'RETUNE', 'CONTRAFACTUM', 'TRANSLYRICS', 'REMIX', 'REMASTER', 'MASHUP', 'INSTRUMENTAL', 'OTHERS')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'core',
        table: 'song_external_link',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('label', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('platform', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('platform_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'song_external_link_platform_check_6c190e7f',
            sql`"platform" IN ('YOUTUBE', 'NICONICO', 'BILIBILI', 'VOCALOID_WIKI', 'VOCALOID_LYRICS_WIKI', 'SOUNDCLOUD', 'NETEASE_MUSIC', 'QQ_MUSIC', 'FIVE_SING', 'KUGOU', 'SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE_MUSIC', 'WIKIPEDIA', 'BAIDU_BAIKE', 'PIXIV', 'WEIBO', 'TWITTER', 'VOCADB', 'MOEGIRLPEDIA', 'MUSICBRAINZ', 'VCPEDIA', 'XIAOHONGSHU')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'core',
        table: 'song_in_album',
        columns: [
          col('album_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('disc_number', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('track_number', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'song_in_series',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('order', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('series_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'song_series',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', {
            notNull: true,
            default: lit('zh'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'song_tag',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('song_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('tag_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'svs_engine',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'svs_engine_version',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('svs_engine_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('version_string', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'tag',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('parent_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'core',
        table: 'voicebank',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('language', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('localized_descriptions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('singer_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('svs_engine_version_id', 'int4', {
            notNull: true,
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
        schema: 'meta',
        table: 'history',
        columns: [
          col('comment', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('new', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('object_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('old', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('table', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'history_type_check_d6a58d8c',
            sql`"type" IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'meta',
        table: 'outbox',
        columns: [
          col('aggregate_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('aggregate_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('event_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('last_error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('next_retry_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('payload', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('processed_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('retry_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'outbox_status_check_8a5bce80',
            sql`"status" IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'meta',
        table: 'permission',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'meta',
        table: 'role',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('localized_names', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'meta',
        table: 'role_permission',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('permission_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('role_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'platform',
        table: 'file',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('original_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('path', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'platform',
        table: 'post',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('text', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'platform',
        table: 'reputation_history',
        columns: [
          col('action_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('points', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source_type', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'auth',
        table: 'session',
        constraint: 'session_token_key',
        columns: ['token'],
      }),
      this.addUnique({
        schema: 'auth',
        table: 'user',
        constraint: 'user_username_key',
        columns: ['username'],
      }),
      this.addUnique({
        schema: 'auth',
        table: 'user',
        constraint: 'user_display_username_key',
        columns: ['display_username'],
      }),
      this.addUnique({
        schema: 'auth',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'core',
        table: 'artist',
        constraint: 'artist_user_id_key',
        columns: ['user_id'],
      }),
      this.addUnique({
        schema: 'meta',
        table: 'role',
        constraint: 'role_name_key',
        columns: ['name'],
      }),
      this.createIndex({
        schema: 'auth',
        table: 'account',
        index: 'account_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'auth',
        table: 'session',
        index: 'session_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'auth',
        table: 'user',
        index: 'user_role_id_idx_d9467c50',
        columns: ['role_id'],
      }),
      this.createIndex({
        schema: 'auth',
        table: 'verification',
        index: 'verification_identifier_idx_79a0dbb3',
        columns: ['identifier'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'creation',
        index: 'creation_artist_id_idx_7b897fc3',
        columns: ['artist_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'creation',
        index: 'creation_artist_role_id_idx_781168c1',
        columns: ['artist_role_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'creation',
        index: 'creation_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'lyrics',
        index: 'lyrics_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'performance',
        index: 'performance_singer_id_idx_853e5131',
        columns: ['singer_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'performance',
        index: 'performance_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'performance',
        index: 'performance_svs_engine_id_idx_c8423cc4',
        columns: ['svs_engine_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'performance',
        index: 'performance_svs_engine_version_id_idx_b4f0f98a',
        columns: ['svs_engine_version_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'performance',
        index: 'performance_voicebank_id_idx_a0a32bfa',
        columns: ['voicebank_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song',
        index: 'song_original_song_id_idx_ef45027e',
        columns: ['original_song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_external_link',
        index: 'song_external_link_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_in_album',
        index: 'song_in_album_album_id_idx_de2911bb',
        columns: ['album_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_in_album',
        index: 'song_in_album_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_in_series',
        index: 'song_in_series_series_id_idx_57e32972',
        columns: ['series_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_in_series',
        index: 'song_in_series_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_tag',
        index: 'song_tag_song_id_idx_2e2805d0',
        columns: ['song_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'song_tag',
        index: 'song_tag_tag_id_idx_94b47830',
        columns: ['tag_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'svs_engine_version',
        index: 'svs_engine_version_svs_engine_id_idx_c8423cc4',
        columns: ['svs_engine_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'tag',
        index: 'tag_parent_id_idx_ab33b399',
        columns: ['parent_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'voicebank',
        index: 'voicebank_singer_id_idx_853e5131',
        columns: ['singer_id'],
      }),
      this.createIndex({
        schema: 'core',
        table: 'voicebank',
        index: 'voicebank_svs_engine_version_id_idx_b4f0f98a',
        columns: ['svs_engine_version_id'],
      }),
      this.createIndex({
        schema: 'meta',
        table: 'history',
        index: 'history_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'meta',
        table: 'outbox',
        index: 'outbox_status_next_retry_at_idx_e5c71f91',
        columns: ['status', 'next_retry_at'],
      }),
      this.createIndex({
        schema: 'meta',
        table: 'role_permission',
        index: 'role_permission_permission_id_idx_909cec36',
        columns: ['permission_id'],
      }),
      this.createIndex({
        schema: 'meta',
        table: 'role_permission',
        index: 'role_permission_role_id_idx_d9467c50',
        columns: ['role_id'],
      }),
      this.createIndex({
        schema: 'platform',
        table: 'file',
        index: 'file_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'platform',
        table: 'post',
        index: 'post_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'platform',
        table: 'reputation_history',
        index: 'reputation_history_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'auth',
        table: 'account',
        foreignKey: {
          name: 'account_userId_fkey',
          columns: ['userId'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'auth',
        table: 'session',
        foreignKey: {
          name: 'session_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'auth',
        table: 'user',
        foreignKey: {
          name: 'user_role_id_fkey',
          columns: ['role_id'],
          references: { schema: 'meta', table: 'role', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'artist',
        foreignKey: {
          name: 'artist_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'creation',
        foreignKey: {
          name: 'creation_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'creation',
        foreignKey: {
          name: 'creation_artist_id_fkey',
          columns: ['artist_id'],
          references: { schema: 'core', table: 'artist', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'creation',
        foreignKey: {
          name: 'creation_artist_role_id_fkey',
          columns: ['artist_role_id'],
          references: { schema: 'core', table: 'artist_role', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'lyrics',
        foreignKey: {
          name: 'lyrics_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'performance',
        foreignKey: {
          name: 'performance_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'performance',
        foreignKey: {
          name: 'performance_singer_id_fkey',
          columns: ['singer_id'],
          references: { schema: 'core', table: 'singer', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'performance',
        foreignKey: {
          name: 'performance_voicebank_id_fkey',
          columns: ['voicebank_id'],
          references: { schema: 'core', table: 'voicebank', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'performance',
        foreignKey: {
          name: 'performance_svs_engine_id_fkey',
          columns: ['svs_engine_id'],
          references: { schema: 'core', table: 'svs_engine', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'performance',
        foreignKey: {
          name: 'performance_svs_engine_version_id_fkey',
          columns: ['svs_engine_version_id'],
          references: { schema: 'core', table: 'svs_engine_version', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song',
        foreignKey: {
          name: 'song_original_song_id_fkey',
          columns: ['original_song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_external_link',
        foreignKey: {
          name: 'song_external_link_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_in_album',
        foreignKey: {
          name: 'song_in_album_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_in_album',
        foreignKey: {
          name: 'song_in_album_album_id_fkey',
          columns: ['album_id'],
          references: { schema: 'core', table: 'album', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_in_series',
        foreignKey: {
          name: 'song_in_series_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_in_series',
        foreignKey: {
          name: 'song_in_series_series_id_fkey',
          columns: ['series_id'],
          references: { schema: 'core', table: 'song_series', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_tag',
        foreignKey: {
          name: 'song_tag_song_id_fkey',
          columns: ['song_id'],
          references: { schema: 'core', table: 'song', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'song_tag',
        foreignKey: {
          name: 'song_tag_tag_id_fkey',
          columns: ['tag_id'],
          references: { schema: 'core', table: 'tag', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'svs_engine_version',
        foreignKey: {
          name: 'svs_engine_version_svs_engine_id_fkey',
          columns: ['svs_engine_id'],
          references: { schema: 'core', table: 'svs_engine', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'tag',
        foreignKey: {
          name: 'tag_parent_id_fkey',
          columns: ['parent_id'],
          references: { schema: 'core', table: 'tag', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'voicebank',
        foreignKey: {
          name: 'voicebank_singer_id_fkey',
          columns: ['singer_id'],
          references: { schema: 'core', table: 'singer', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'core',
        table: 'voicebank',
        foreignKey: {
          name: 'voicebank_svs_engine_version_id_fkey',
          columns: ['svs_engine_version_id'],
          references: { schema: 'core', table: 'svs_engine_version', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'meta',
        table: 'history',
        foreignKey: {
          name: 'history_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'meta',
        table: 'role_permission',
        foreignKey: {
          name: 'role_permission_role_id_fkey',
          columns: ['role_id'],
          references: { schema: 'meta', table: 'role', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'meta',
        table: 'role_permission',
        foreignKey: {
          name: 'role_permission_permission_id_fkey',
          columns: ['permission_id'],
          references: { schema: 'meta', table: 'permission', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'platform',
        table: 'file',
        foreignKey: {
          name: 'file_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'platform',
        table: 'post',
        foreignKey: {
          name: 'post_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'platform',
        table: 'reputation_history',
        foreignKey: {
          name: 'reputation_history_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'auth', table: 'user', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
