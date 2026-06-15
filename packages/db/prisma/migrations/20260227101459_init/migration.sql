-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "meta";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateEnum
CREATE TYPE "core"."third_party_platform" AS ENUM ('YOUTUBE', 'NICONICO', 'BILIBILI', 'VOCALOID_WIKI', 'VOCALOID_LYRICS_WIKI', 'SOUNDCLOUD', 'NETEASE_MUSIC', 'QQ_MUSIC', 'FIVE_SING', 'KUGOU', 'SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE_MUSIC', 'WIKIPEDIA', 'BAIDU_BAIKE', 'PIXIV', 'WEIBO', 'TWITTER', 'VOCADB', 'MOEGIRLPEDIA', 'MUSICBRAINZ', 'VCPEDIA', 'XIAOHONGSHU');

-- CreateEnum
CREATE TYPE "core"."song_type" AS ENUM ('ORIGINAL', 'COVER', 'REMIX', 'REMASTER', 'MASHUP', 'INSTRUMENTAL', 'OTHERS');

-- CreateEnum
CREATE TYPE "meta"."change_type" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateTable
CREATE TABLE "auth"."session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "secret_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "role_id" INTEGER,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."album" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "localized_names" JSONB,
    "description" TEXT,
    "localized_descriptions" JSONB,
    "cover_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."artist" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "localized_names" JSONB,
    "aliases" TEXT[],
    "description" TEXT,
    "localized_descriptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."artist_role" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "localized_roles" JSONB,
    "song_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "artist_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."external_link" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "platform" "core"."third_party_platform",
    "platform_id" TEXT,
    "song_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "external_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."group" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."lyrics" (
    "id" SERIAL NOT NULL,
    "song_id" INTEGER NOT NULL,
    "language" TEXT,
    "plain_text" TEXT,
    "ttml" TEXT,
    "lrc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lyrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."singer" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "localized_names" JSONB,
    "description" TEXT,
    "localized_descriptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "singer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."song" (
    "id" SERIAL NOT NULL,
    "type" "core"."song_type",
    "original_song_id" INTEGER,
    "name" TEXT,
    "duration" INTEGER,
    "localized_names" JSONB,
    "description" TEXT,
    "localized_descriptions" JSONB,
    "bilibili_aid" BIGINT,
    "bilibili_bvid" TEXT,
    "vocadb_id" INTEGER,
    "vcpedia_id" INTEGER,
    "moegirl_id" INTEGER,
    "cover_url" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."song_series" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "localized_names" JSONB,
    "description" TEXT,
    "localized_descriptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "song_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."svs_engine" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "localized_descriptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "svs_engine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."svs_engine_version" (
    "id" SERIAL NOT NULL,
    "version_string" TEXT NOT NULL,
    "svs_engine_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "svs_engine_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."tag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "localized_names" JSONB,
    "parent_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."voicebank" (
    "id" SERIAL NOT NULL,
    "description" TEXT,
    "localized_descriptions" JSONB,
    "singer_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "svs_engine_version_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "voicebank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."history" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "object_id" INTEGER NOT NULL,
    "type" "meta"."change_type" NOT NULL,
    "comment" TEXT,
    "old" JSONB,
    "new" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."permission" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "localized_names" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."file" (
    "id" TEXT NOT NULL,
    "original_name" TEXT,
    "path" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."post" (
    "id" TEXT NOT NULL,
    "text" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."reputation_history" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "source_type" INTEGER NOT NULL,
    "source_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."singer_of_song" (
    "id" SERIAL NOT NULL,
    "song_id" INTEGER NOT NULL,
    "singer_id" INTEGER NOT NULL,
    "voicebank_id" INTEGER,
    "svs_engine_id" INTEGER,
    "svs_engine_version_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "singer_of_song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."singer_svs_engine" (
    "id" SERIAL NOT NULL,
    "singer_id" INTEGER NOT NULL,
    "svs_engine_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "singer_svs_engine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."singer_svs_engine_version" (
    "id" SERIAL NOT NULL,
    "singer_id" INTEGER NOT NULL,
    "svs_engine_version_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "singer_svs_engine_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."song_in_album" (
    "id" SERIAL NOT NULL,
    "song_id" INTEGER NOT NULL,
    "album_id" INTEGER NOT NULL,
    "track_number" INTEGER NOT NULL,
    "disc_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "song_in_album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."song_in_series" (
    "id" SERIAL NOT NULL,
    "song_id" INTEGER NOT NULL,
    "series_id" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "song_in_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."song_tag" (
    "id" SERIAL NOT NULL,
    "song_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "song_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta"."role_permission" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "auth"."user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "auth"."user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "artist_user_id_key" ON "core"."artist"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "meta"."role"("name");

-- AddForeignKey
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "meta"."role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."artist" ADD CONSTRAINT "artist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."artist_role" ADD CONSTRAINT "artist_role_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."artist_role" ADD CONSTRAINT "artist_role_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "core"."artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."external_link" ADD CONSTRAINT "external_link_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."lyrics" ADD CONSTRAINT "lyrics_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song" ADD CONSTRAINT "song_original_song_id_fkey" FOREIGN KEY ("original_song_id") REFERENCES "core"."song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."svs_engine_version" ADD CONSTRAINT "svs_engine_version_svs_engine_id_fkey" FOREIGN KEY ("svs_engine_id") REFERENCES "core"."svs_engine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tag" ADD CONSTRAINT "tag_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "core"."tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."voicebank" ADD CONSTRAINT "voicebank_singer_id_fkey" FOREIGN KEY ("singer_id") REFERENCES "core"."singer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."voicebank" ADD CONSTRAINT "voicebank_svs_engine_version_id_fkey" FOREIGN KEY ("svs_engine_version_id") REFERENCES "core"."svs_engine_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."history" ADD CONSTRAINT "history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."file" ADD CONSTRAINT "file_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."post" ADD CONSTRAINT "post_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."reputation_history" ADD CONSTRAINT "reputation_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_of_song" ADD CONSTRAINT "singer_of_song_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_of_song" ADD CONSTRAINT "singer_of_song_singer_id_fkey" FOREIGN KEY ("singer_id") REFERENCES "core"."singer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_of_song" ADD CONSTRAINT "singer_of_song_voicebank_id_fkey" FOREIGN KEY ("voicebank_id") REFERENCES "core"."voicebank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_of_song" ADD CONSTRAINT "singer_of_song_svs_engine_id_fkey" FOREIGN KEY ("svs_engine_id") REFERENCES "core"."svs_engine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_of_song" ADD CONSTRAINT "singer_of_song_svs_engine_version_id_fkey" FOREIGN KEY ("svs_engine_version_id") REFERENCES "core"."svs_engine_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_svs_engine" ADD CONSTRAINT "singer_svs_engine_singer_id_fkey" FOREIGN KEY ("singer_id") REFERENCES "core"."singer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_svs_engine" ADD CONSTRAINT "singer_svs_engine_svs_engine_id_fkey" FOREIGN KEY ("svs_engine_id") REFERENCES "core"."svs_engine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_svs_engine_version" ADD CONSTRAINT "singer_svs_engine_version_singer_id_fkey" FOREIGN KEY ("singer_id") REFERENCES "core"."singer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."singer_svs_engine_version" ADD CONSTRAINT "singer_svs_engine_version_svs_engine_version_id_fkey" FOREIGN KEY ("svs_engine_version_id") REFERENCES "core"."svs_engine_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song_in_album" ADD CONSTRAINT "song_in_album_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song_in_album" ADD CONSTRAINT "song_in_album_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "core"."album"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song_in_series" ADD CONSTRAINT "song_in_series_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song_in_series" ADD CONSTRAINT "song_in_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "core"."song_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song_tag" ADD CONSTRAINT "song_tag_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "core"."song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."song_tag" ADD CONSTRAINT "song_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "core"."tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "meta"."role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta"."role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "meta"."permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
