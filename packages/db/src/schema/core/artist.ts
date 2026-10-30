import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, json, serial, text, unique } from "drizzle-orm/pg-core";
import { user } from "../identity";
import { core } from "../schemas";
import { song } from "./song";
import { managedInstant, temporalInstant } from "../../customTypes";

const id = () => serial("id").primaryKey();
const createdAt = () => temporalInstant("created_at").notNull().default(sql`now()`);
const updatedAt = () => managedInstant("updated_at").notNull();
const deletedAt = () => temporalInstant("deleted_at");

export const artist = core.table(
	"artist",
	{
		id: id(),
		name: text("name"),
		localizedNames: json("localized_names"),
		language: text("language").notNull().default("zh"),
		aliases: text("aliases").array().notNull(),
		description: text("description"),
		localizedDescriptions: json("localized_descriptions"),
		userId: text("user_id"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		unique("artist_user_id_key").on(table.userId),
		foreignKey({
			name: "artist_user_id_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}),
		check(
			"artist_aliases_elem_not_null_3676266c",
			sql`array_position(aliases, NULL::text) IS NULL`
		),
	]
);

export const artistRole = core.table("artist_role", {
	id: id(),
	name: text("name").notNull(),
	localizedNames: json("localized_names"),
	language: text("language").notNull().default("zh"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const creation = core.table(
	"creation",
	{
		id: id(),
		songId: integer("song_id").notNull(),
		artistId: integer("artist_id").notNull(),
		artistRoleId: integer("artist_role_id").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("creation_artist_id_idx_7b897fc3").on(table.artistId),
		index("creation_artist_role_id_idx_781168c1").on(table.artistRoleId),
		index("creation_song_id_idx_2e2805d0").on(table.songId),
		foreignKey({
			name: "creation_artist_id_fkey",
			columns: [table.artistId],
			foreignColumns: [artist.id],
		}),
		foreignKey({
			name: "creation_artist_role_id_fkey",
			columns: [table.artistRoleId],
			foreignColumns: [artistRole.id],
		}),
		foreignKey({
			name: "creation_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
	]
);

export type Artist = typeof artist.$inferSelect;
export type ArtistInsert = typeof artist.$inferInsert;
export type ArtistRole = typeof artistRole.$inferSelect;
export type ArtistRoleInsert = typeof artistRole.$inferInsert;
export type Creation = typeof creation.$inferSelect;
export type CreationInsert = typeof creation.$inferInsert;
