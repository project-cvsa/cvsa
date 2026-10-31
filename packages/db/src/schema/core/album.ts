import { sql } from "drizzle-orm";
import { foreignKey, index, integer, json, serial, text } from "drizzle-orm/pg-core";
import { core } from "../schemas";
import { song } from "./song";
import { managedInstant, temporalInstant } from "../../customTypes";

const id = () => serial("id").primaryKey();
const createdAt = () => temporalInstant("created_at").notNull().default(sql`now()`);
const updatedAt = () => managedInstant("updated_at").notNull();
const deletedAt = () => temporalInstant("deleted_at");

export const album = core.table("album", {
	id: id(),
	name: text("name"),
	localizedNames: json("localized_names"),
	description: text("description"),
	localizedDescriptions: json("localized_descriptions"),
	language: text("language").notNull().default("zh"),
	coverUrl: text("cover_url"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const group = core.table("group", {
	id: id(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const songSeries = core.table("song_series", {
	id: id(),
	name: text("name"),
	localizedNames: json("localized_names"),
	description: text("description"),
	localizedDescriptions: json("localized_descriptions"),
	language: text("language").notNull().default("zh"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const songInAlbum = core.table(
	"song_in_album",
	{
		id: id(),
		songId: integer("song_id").notNull(),
		albumId: integer("album_id").notNull(),
		trackNumber: integer("track_number").notNull(),
		discNumber: integer("disc_number").notNull().default(1),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("song_in_album_album_id_idx_de2911bb").on(table.albumId),
		index("song_in_album_song_id_idx_2e2805d0").on(table.songId),
		foreignKey({
			name: "song_in_album_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
		foreignKey({
			name: "song_in_album_album_id_fkey",
			columns: [table.albumId],
			foreignColumns: [album.id],
		}),
	]
);

export const songInSeries = core.table(
	"song_in_series",
	{
		id: id(),
		songId: integer("song_id").notNull(),
		seriesId: integer("series_id").notNull(),
		order: integer("order").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("song_in_series_series_id_idx_57e32972").on(table.seriesId),
		index("song_in_series_song_id_idx_2e2805d0").on(table.songId),
		foreignKey({
			name: "song_in_series_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
		foreignKey({
			name: "song_in_series_series_id_fkey",
			columns: [table.seriesId],
			foreignColumns: [songSeries.id],
		}),
	]
);

export type Album = typeof album.$inferSelect;
export type AlbumInsert = typeof album.$inferInsert;
export type Group = typeof group.$inferSelect;
export type GroupInsert = typeof group.$inferInsert;
export type SongSeries = typeof songSeries.$inferSelect;
export type SongSeriesInsert = typeof songSeries.$inferInsert;
export type SongInAlbum = typeof songInAlbum.$inferSelect;
export type SongInAlbumInsert = typeof songInAlbum.$inferInsert;
export type SongInSeries = typeof songInSeries.$inferSelect;
export type SongInSeriesInsert = typeof songInSeries.$inferInsert;
