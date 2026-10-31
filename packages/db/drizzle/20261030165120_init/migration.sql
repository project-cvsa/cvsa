-- Initial catalog schema.
--
-- Every statement is idempotent: databases provisioned by the previous
-- (Prisma) toolchain already contain these tables, schemas and constraints, and
-- adopting the Drizzle history must not attempt to recreate them.

CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "core";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "meta";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "platform";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."album" (
	"id" serial PRIMARY KEY,
	"name" text,
	"localized_names" json,
	"description" text,
	"localized_descriptions" json,
	"language" text DEFAULT 'zh' NOT NULL,
	"cover_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."group" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."song_in_album" (
	"id" serial PRIMARY KEY,
	"song_id" integer NOT NULL,
	"album_id" integer NOT NULL,
	"track_number" integer NOT NULL,
	"disc_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."song_in_series" (
	"id" serial PRIMARY KEY,
	"song_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."song_series" (
	"id" serial PRIMARY KEY,
	"name" text,
	"localized_names" json,
	"description" text,
	"localized_descriptions" json,
	"language" text DEFAULT 'zh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."artist" (
	"id" serial PRIMARY KEY,
	"name" text,
	"localized_names" json,
	"language" text DEFAULT 'zh' NOT NULL,
	"aliases" text[] NOT NULL,
	"description" text,
	"localized_descriptions" json,
	"user_id" text CONSTRAINT "artist_user_id_key" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "artist_aliases_elem_not_null_3676266c" CHECK (array_position(aliases, NULL::text) IS NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."artist_role" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"localized_names" json,
	"language" text DEFAULT 'zh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."creation" (
	"id" serial PRIMARY KEY,
	"song_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"artist_role_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."performance" (
	"id" serial PRIMARY KEY,
	"song_id" integer NOT NULL,
	"singer_id" integer NOT NULL,
	"voicebank_id" integer,
	"svs_engine_id" integer,
	"svs_engine_version_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."singer" (
	"id" serial PRIMARY KEY,
	"name" text,
	"avatar_url" text,
	"language" text DEFAULT 'zh' NOT NULL,
	"localized_names" json,
	"description" text,
	"localized_descriptions" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."svs_engine" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"localized_descriptions" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."svs_engine_version" (
	"id" serial PRIMARY KEY,
	"version_string" text NOT NULL,
	"svs_engine_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."voicebank" (
	"id" serial PRIMARY KEY,
	"singer_id" integer NOT NULL,
	"description" text,
	"localized_descriptions" json,
	"language" text NOT NULL,
	"svs_engine_version_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."lyrics" (
	"id" serial PRIMARY KEY,
	"song_id" integer NOT NULL,
	"language" text DEFAULT 'zh' NOT NULL,
	"is_translated" boolean DEFAULT false NOT NULL,
	"plain_text" text,
	"ttml" text,
	"lrc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."song" (
	"id" serial PRIMARY KEY,
	"type" text,
	"original_song_id" integer,
	"language" text DEFAULT 'zh' NOT NULL,
	"name" text,
	"localized_names" json,
	"duration" integer,
	"description" text,
	"localized_descriptions" json,
	"bilibili_aid" bigint,
	"bilibili_bvid" text,
	"vocadb_id" integer,
	"vcpedia_id" integer,
	"moegirl_id" integer,
	"cover_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "song_type_check_f4a93cc7" CHECK ("type" = ANY (ARRAY['ORIGINAL'::text, 'COVER'::text, 'RETUNE'::text, 'CONTRAFACTUM'::text, 'TRANSLYRICS'::text, 'REMIX'::text, 'REMASTER'::text, 'MASHUP'::text, 'INSTRUMENTAL'::text, 'OTHERS'::text]))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."song_external_link" (
	"id" serial PRIMARY KEY,
	"label" text,
	"url" text NOT NULL,
	"platform" text,
	"platform_id" text,
	"song_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "song_external_link_platform_check_6c190e7f" CHECK ("platform" = ANY (ARRAY['YOUTUBE'::text, 'NICONICO'::text, 'BILIBILI'::text, 'VOCALOID_WIKI'::text, 'VOCALOID_LYRICS_WIKI'::text, 'SOUNDCLOUD'::text, 'NETEASE_MUSIC'::text, 'QQ_MUSIC'::text, 'FIVE_SING'::text, 'KUGOU'::text, 'SPOTIFY'::text, 'APPLE_MUSIC'::text, 'YOUTUBE_MUSIC'::text, 'WIKIPEDIA'::text, 'BAIDU_BAIKE'::text, 'PIXIV'::text, 'WEIBO'::text, 'TWITTER'::text, 'VOCADB'::text, 'MOEGIRLPEDIA'::text, 'MUSICBRAINZ'::text, 'VCPEDIA'::text, 'XIAOHONGSHU'::text]))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."song_tag" (
	"id" serial PRIMARY KEY,
	"song_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core"."tag" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"localized_names" json,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."account" (
	"id" text PRIMARY KEY,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."permission" (
	"id" serial PRIMARY KEY,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."role" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL CONSTRAINT "role_name_key" UNIQUE,
	"localized_names" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."role_permission" (
	"id" serial PRIMARY KEY,
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."session" (
	"id" text PRIMARY KEY,
	"token" text NOT NULL CONSTRAINT "session_token_key" UNIQUE,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."user" (
	"id" text PRIMARY KEY,
	"name" text,
	"username" text NOT NULL CONSTRAINT "user_username_key" UNIQUE,
	"display_username" text NOT NULL CONSTRAINT "user_display_username_key" UNIQUE,
	"email" text CONSTRAINT "user_email_key" UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role_id" integer,
	"reputation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth"."verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."file" (
	"id" text PRIMARY KEY,
	"original_name" text,
	"path" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."history" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"table" text NOT NULL,
	"object_id" integer NOT NULL,
	"type" text NOT NULL,
	"comment" text,
	"old" json,
	"new" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_type_check_d6a58d8c" CHECK ("type" = ANY (ARRAY['CREATE'::text, 'UPDATE'::text, 'DELETE'::text, 'RESTORE'::text]))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."outbox" (
	"id" serial PRIMARY KEY,
	"aggregate_type" text NOT NULL,
	"aggregate_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" json,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "outbox_status_check_8a5bce80" CHECK ("status" = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'PROCESSED'::text, 'FAILED'::text]))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."post" (
	"id" text PRIMARY KEY,
	"text" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."reputation_history" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"points" integer NOT NULL,
	"source_type" integer NOT NULL,
	"source_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_in_album_album_id_idx_de2911bb" ON "core"."song_in_album" ("album_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_in_album_song_id_idx_2e2805d0" ON "core"."song_in_album" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_in_series_series_id_idx_57e32972" ON "core"."song_in_series" ("series_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_in_series_song_id_idx_2e2805d0" ON "core"."song_in_series" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creation_artist_id_idx_7b897fc3" ON "core"."creation" ("artist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creation_artist_role_id_idx_781168c1" ON "core"."creation" ("artist_role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creation_song_id_idx_2e2805d0" ON "core"."creation" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_singer_id_idx_853e5131" ON "core"."performance" ("singer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_song_id_idx_2e2805d0" ON "core"."performance" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_svs_engine_id_idx_c8423cc4" ON "core"."performance" ("svs_engine_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_svs_engine_version_id_idx_b4f0f98a" ON "core"."performance" ("svs_engine_version_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_voicebank_id_idx_a0a32bfa" ON "core"."performance" ("voicebank_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "svs_engine_version_svs_engine_id_idx_c8423cc4" ON "core"."svs_engine_version" ("svs_engine_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voicebank_singer_id_idx_853e5131" ON "core"."voicebank" ("singer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voicebank_svs_engine_version_id_idx_b4f0f98a" ON "core"."voicebank" ("svs_engine_version_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lyrics_song_id_idx_2e2805d0" ON "core"."lyrics" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_original_song_id_idx_ef45027e" ON "core"."song" ("original_song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_external_link_song_id_idx_2e2805d0" ON "core"."song_external_link" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_tag_song_id_idx_2e2805d0" ON "core"."song_tag" ("song_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "song_tag_tag_id_idx_94b47830" ON "core"."song_tag" ("tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_parent_id_idx_ab33b399" ON "core"."tag" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx_a489d58a" ON "auth"."account" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permission_permission_id_idx_909cec36" ON "meta"."role_permission" ("permission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permission_role_id_idx_d9467c50" ON "meta"."role_permission" ("role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx_6c952402" ON "auth"."session" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_role_id_idx_d9467c50" ON "auth"."user" ("role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx_79a0dbb3" ON "auth"."verification" ("identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_user_id_idx_6c952402" ON "platform"."file" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "history_user_id_idx_6c952402" ON "meta"."history" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_status_next_retry_at_idx_e5c71f91" ON "meta"."outbox" ("status","next_retry_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_user_id_idx_6c952402" ON "platform"."post" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reputation_history_user_id_idx_6c952402" ON "platform"."reputation_history" ("user_id");
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_in_album" ADD CONSTRAINT "song_in_album_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_in_album" ADD CONSTRAINT "song_in_album_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "core"."album"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_in_series" ADD CONSTRAINT "song_in_series_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_in_series" ADD CONSTRAINT "song_in_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "core"."song_series"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."artist" ADD CONSTRAINT "artist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."creation" ADD CONSTRAINT "creation_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "core"."artist"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."creation" ADD CONSTRAINT "creation_artist_role_id_fkey" FOREIGN KEY ("artist_role_id") REFERENCES "core"."artist_role"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."creation" ADD CONSTRAINT "creation_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."performance" ADD CONSTRAINT "performance_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."performance" ADD CONSTRAINT "performance_singer_id_fkey" FOREIGN KEY ("singer_id") REFERENCES "core"."singer"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."performance" ADD CONSTRAINT "performance_svs_engine_id_fkey" FOREIGN KEY ("svs_engine_id") REFERENCES "core"."svs_engine"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."performance" ADD CONSTRAINT "performance_svs_engine_version_id_fkey" FOREIGN KEY ("svs_engine_version_id") REFERENCES "core"."svs_engine_version"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."performance" ADD CONSTRAINT "performance_voicebank_id_fkey" FOREIGN KEY ("voicebank_id") REFERENCES "core"."voicebank"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."svs_engine_version" ADD CONSTRAINT "svs_engine_version_svs_engine_id_fkey" FOREIGN KEY ("svs_engine_id") REFERENCES "core"."svs_engine"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."voicebank" ADD CONSTRAINT "voicebank_singer_id_fkey" FOREIGN KEY ("singer_id") REFERENCES "core"."singer"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."voicebank" ADD CONSTRAINT "voicebank_svs_engine_version_id_fkey" FOREIGN KEY ("svs_engine_version_id") REFERENCES "core"."svs_engine_version"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."lyrics" ADD CONSTRAINT "lyrics_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song" ADD CONSTRAINT "song_original_song_id_fkey" FOREIGN KEY ("original_song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_external_link" ADD CONSTRAINT "song_external_link_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_tag" ADD CONSTRAINT "song_tag_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."song_tag" ADD CONSTRAINT "song_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "core"."tag"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "core"."tag" ADD CONSTRAINT "tag_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "core"."tag"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "meta"."role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "meta"."permission"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "meta"."role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "meta"."role"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "auth"."user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "meta"."role"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "platform"."file" ADD CONSTRAINT "file_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "meta"."history" ADD CONSTRAINT "history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "platform"."post" ADD CONSTRAINT "post_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
--> statement-breakpoint
DO $$
BEGIN
ALTER TABLE "platform"."reputation_history" ADD CONSTRAINT "reputation_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$
