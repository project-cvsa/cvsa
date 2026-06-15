import { z } from "zod";
import {
	SongSchema,
	SingerSchema,
	ArtistSchema,
	ArtistRoleSchema,
	SongTypeSchema,
	type Serialized,
	LyricsSchema,
} from "@cvsa/db";

export type SongId = number;

const CreateCreationSchema = z.object({
	artistId: z.int().positive(),
	roleId: z.int().positive(),
});

const CreatePerformanceSchema = z.object({
	singerId: z.int().positive(),
	voicebankId: z.int().positive().optional(),
	svsEngineId: z.int().positive().optional(),
	svsEngineVersionId: z.int().positive().optional(),
});

export const SongLyricsCreateRequestSchema = z.object({
	language: z.string().optional(),
	isTranslated: z.boolean().optional(),
	plainText: z.string().optional(),
	ttml: z.string().optional(),
	lrc: z.string().optional(),
});

export const SongLyricsUpdateRequestSchema = z.object({
	language: z.string().optional(),
	isTranslated: z.boolean().optional(),
	plainText: z.string().optional(),
	ttml: z.string().optional(),
	lrc: z.string().optional(),
});

export const CreateSongRequestSchema = z.object({
	name: z.string().optional(),
	type: SongTypeSchema.optional(),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
	duration: z.int().optional(),
	coverUrl: z.url().optional(),
	publishedAt: z.iso.datetime().optional(),
	performances: z.array(CreatePerformanceSchema).optional(),
	creations: z.array(CreateCreationSchema).optional(),
	lyrics: z.array(SongLyricsCreateRequestSchema).optional(),
});

export const UpdateSongRequestSchema = z.object({
	name: z.string().optional(),
	type: SongTypeSchema.optional(),
	duration: z.int().optional(),
	description: z.string().optional(),
	coverUrl: z.url().optional(),
	publishedAt: z.iso.datetime().optional(),
});

export const SongDetailsResponseSchema = z.intersection(
	SongSchema.omit({ deletedAt: true }),
	z.object({
		singers: z
			.intersection(
				SingerSchema.omit({ deletedAt: true }),
				z.object({
					engine: z.string().nullable(),
				})
			)
			.array(),
		artists: z
			.intersection(
				ArtistSchema.omit({ deletedAt: true }),
				z.object({ role: ArtistRoleSchema })
			)
			.array(),
		lyrics: LyricsSchema.omit({ deletedAt: true }).array(),
	})
);

export const SongResponseSchema = SongSchema.omit({ deletedAt: true });

export const SongLyricsResponseSchema = LyricsSchema.omit({
	songId: true,
	deletedAt: true,
});

export const SongLyricsListResponseSchema = SongLyricsResponseSchema.array();

export type SongResponseDto = Serialized<z.infer<typeof SongResponseSchema>>;
export type CreateSongRequestDto = Serialized<z.infer<typeof CreateSongRequestSchema>>;
export type UpdateSongRequestDto = Serialized<z.infer<typeof UpdateSongRequestSchema>>;
export type SongDetailsResponseDto = Serialized<z.infer<typeof SongDetailsResponseSchema>>;

export type SongLyricsResponseDto = Serialized<z.infer<typeof SongLyricsResponseSchema>>;
export type SongLyricsListResponseDto = Serialized<z.infer<typeof SongLyricsListResponseSchema>>;
export type SongLyricsCreateRequestDto = Serialized<z.infer<typeof SongLyricsCreateRequestSchema>>;
export type SongLyricsUpdateRequestDto = Serialized<z.infer<typeof SongLyricsUpdateRequestSchema>>;
