import { sql } from "drizzle-orm";
import { foreignKey, index, integer, json, serial, text } from "drizzle-orm/pg-core";
import { core } from "../schemas";
import { song } from "./song";
import { managedInstant, temporalInstant } from "../../customTypes";

const id = () => serial("id").primaryKey();
const createdAt = () => temporalInstant("created_at").notNull().default(sql`now()`);
const updatedAt = () => managedInstant("updated_at").notNull();
const deletedAt = () => temporalInstant("deleted_at");

export const singer = core.table("singer", {
	id: id(),
	name: text("name"),
	avatarUrl: text("avatar_url"),
	language: text("language").notNull().default("zh"),
	localizedNames: json("localized_names"),
	description: text("description"),
	localizedDescriptions: json("localized_descriptions"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const svsEngine = core.table("svs_engine", {
	id: id(),
	name: text("name").notNull(),
	description: text("description"),
	localizedDescriptions: json("localized_descriptions"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const svsEngineVersion = core.table(
	"svs_engine_version",
	{
		id: id(),
		versionString: text("version_string").notNull(),
		svsEngineId: integer("svs_engine_id").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("svs_engine_version_svs_engine_id_idx_c8423cc4").on(table.svsEngineId),
		foreignKey({
			name: "svs_engine_version_svs_engine_id_fkey",
			columns: [table.svsEngineId],
			foreignColumns: [svsEngine.id],
		}),
	]
);

export const voicebank = core.table(
	"voicebank",
	{
		id: id(),
		singerId: integer("singer_id").notNull(),
		description: text("description"),
		localizedDescriptions: json("localized_descriptions"),
		language: text("language").notNull(),
		svsEngineVersionId: integer("svs_engine_version_id").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("voicebank_singer_id_idx_853e5131").on(table.singerId),
		index("voicebank_svs_engine_version_id_idx_b4f0f98a").on(table.svsEngineVersionId),
		foreignKey({
			name: "voicebank_singer_id_fkey",
			columns: [table.singerId],
			foreignColumns: [singer.id],
		}),
		foreignKey({
			name: "voicebank_svs_engine_version_id_fkey",
			columns: [table.svsEngineVersionId],
			foreignColumns: [svsEngineVersion.id],
		}),
	]
);

export const performance = core.table(
	"performance",
	{
		id: id(),
		songId: integer("song_id").notNull(),
		singerId: integer("singer_id").notNull(),
		voicebankId: integer("voicebank_id"),
		svsEngineId: integer("svs_engine_id"),
		svsEngineVersionId: integer("svs_engine_version_id"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [
		index("performance_singer_id_idx_853e5131").on(table.singerId),
		index("performance_song_id_idx_2e2805d0").on(table.songId),
		index("performance_svs_engine_id_idx_c8423cc4").on(table.svsEngineId),
		index("performance_svs_engine_version_id_idx_b4f0f98a").on(table.svsEngineVersionId),
		index("performance_voicebank_id_idx_a0a32bfa").on(table.voicebankId),
		foreignKey({
			name: "performance_song_id_fkey",
			columns: [table.songId],
			foreignColumns: [song.id],
		}),
		foreignKey({
			name: "performance_singer_id_fkey",
			columns: [table.singerId],
			foreignColumns: [singer.id],
		}),
		foreignKey({
			name: "performance_svs_engine_id_fkey",
			columns: [table.svsEngineId],
			foreignColumns: [svsEngine.id],
		}),
		foreignKey({
			name: "performance_svs_engine_version_id_fkey",
			columns: [table.svsEngineVersionId],
			foreignColumns: [svsEngineVersion.id],
		}),
		foreignKey({
			name: "performance_voicebank_id_fkey",
			columns: [table.voicebankId],
			foreignColumns: [voicebank.id],
		}),
	]
);

export type Singer = typeof singer.$inferSelect;
export type SingerInsert = typeof singer.$inferInsert;
export type SvsEngine = typeof svsEngine.$inferSelect;
export type SvsEngineInsert = typeof svsEngine.$inferInsert;
export type SvsEngineVersion = typeof svsEngineVersion.$inferSelect;
export type SvsEngineVersionInsert = typeof svsEngineVersion.$inferInsert;
export type Voicebank = typeof voicebank.$inferSelect;
export type VoicebankInsert = typeof voicebank.$inferInsert;
export type Performance = typeof performance.$inferSelect;
export type PerformanceInsert = typeof performance.$inferInsert;
