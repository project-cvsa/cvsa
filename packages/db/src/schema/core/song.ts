import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	json,
	serial,
	text,
} from "drizzle-orm/pg-core";
import { managedInstant, temporalInstant } from "../../customTypes";
import type { Platform, SongType } from "../enums";
import { core } from "../schemas";

const id = () => serial("id").primaryKey();
const createdAt = () => temporalInstant("created_at").notNull().default(sql`now()`);
const updatedAt = () => managedInstant("updated_at").notNull();
const deletedAt = () => temporalInstant("deleted_at");

export const song = core.table(
	"song",
	{
		id: id(),
		type: text("type").$type<SongType>(),
		originalSongId: integer("original_song_id"),
		language: text("language").notNull().default("zh"),
		name: text("name"),
		localizedNames: json("localized_names"),
		duration: integer("duration"),
		description: text("description"),
		localizedDescriptions: json("localized_descriptions"),
		bilibiliAid: bigint("bilibili_aid", { mode: "bigint" }),
		bilibiliBvid: text("bilibili_bvid"),
		vocadbId: integer("vocadb_id"),
		vcpediaId: integer("vcpedia_id"),
		moegirlId: integer("moegirl_id"),
		coverUrl: text("cover_url"),
		publishedAt: temporalInstant("published_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("song_original_song_id_idx_ef45027e").on(table.originalSongId),
		check(
			"song_type_check_f4a93cc7",
			sql`"type" = ANY (ARRAY['ORIGINAL'::text, 'COVER'::text, 'RETUNE'::text, 'CONTRAFACTUM'::text, 'TRANSLYRICS'::text, 'REMIX'::text, 'REMASTER'::text, 'MASHUP'::text, 'INSTRUMENTAL'::text, 'OTHERS'::text])`
		),
		foreignKey({
			name: "song_original_song_id_fkey",
			columns: [table.originalSongId],
			foreignColumns: [table.id],
		}),
	]
);

export const lyrics = core.table(
	"lyrics",
	{
		id: id(),
		songId: integer("song_id").notNull(),
		language: text("language").notNull().default("zh"),
		isTranslated: boolean("is_translated").notNull().default(false),
		plainText: text("plain_text"),
		ttml: text("ttml"),
		lrc: text("lrc"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("lyrics_song_id_idx_2e2805d0").on(table.songId),
		foreignKey({
			name: "lyrics_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
	]
);

export const tag = core.table(
	"tag",
	{
		id: id(),
		name: text("name").notNull(),
		localizedNames: json("localized_names"),
		parentId: integer("parent_id"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("tag_parent_id_idx_ab33b399").on(table.parentId),
		foreignKey({
			name: "tag_parent_id_fkey",
			columns: [table.parentId],
			foreignColumns: [table.id],
		}),
	]
);

export const songTag = core.table(
	"song_tag",
	{
		id: id(),
		songId: integer("song_id").notNull(),
		tagId: integer("tag_id").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("song_tag_song_id_idx_2e2805d0").on(table.songId),
		index("song_tag_tag_id_idx_94b47830").on(table.tagId),
		foreignKey({
			name: "song_tag_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
		foreignKey({
			name: "song_tag_tag_id_fkey",
			columns: [table.tagId],
			foreignColumns: [tag.id],
		}),
	]
);

export const songExternalLink = core.table(
	"song_external_link",
	{
		id: id(),
		label: text("label"),
		url: text("url").notNull(),
		platform: text("platform").$type<Platform>(),
		platformId: text("platform_id"),
		songId: integer("song_id").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("song_external_link_song_id_idx_2e2805d0").on(table.songId),
		check(
			"song_external_link_platform_check_6c190e7f",
			sql`"platform" = ANY (ARRAY['YOUTUBE'::text, 'NICONICO'::text, 'BILIBILI'::text, 'VOCALOID_WIKI'::text, 'VOCALOID_LYRICS_WIKI'::text, 'SOUNDCLOUD'::text, 'NETEASE_MUSIC'::text, 'QQ_MUSIC'::text, 'FIVE_SING'::text, 'KUGOU'::text, 'SPOTIFY'::text, 'APPLE_MUSIC'::text, 'YOUTUBE_MUSIC'::text, 'WIKIPEDIA'::text, 'BAIDU_BAIKE'::text, 'PIXIV'::text, 'WEIBO'::text, 'TWITTER'::text, 'VOCADB'::text, 'MOEGIRLPEDIA'::text, 'MUSICBRAINZ'::text, 'VCPEDIA'::text, 'XIAOHONGSHU'::text])`
		),
		foreignKey({
			name: "song_external_link_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
	]
);

export type Song = typeof song.$inferSelect;
export type SongInsert = typeof song.$inferInsert;
export type Lyrics = typeof lyrics.$inferSelect;
export type LyricsInsert = typeof lyrics.$inferInsert;
export type Tag = typeof tag.$inferSelect;
export type TagInsert = typeof tag.$inferInsert;
export type SongTag = typeof songTag.$inferSelect;
export type SongTagInsert = typeof songTag.$inferInsert;
export type SongExternalLink = typeof songExternalLink.$inferSelect;
export type SongExternalLinkInsert = typeof songExternalLink.$inferInsert;
