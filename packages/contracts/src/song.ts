import { z } from "zod";

export const SongTypeSchema = z.enum([
	"ORIGINAL",
	"COVER",
	"RETUNE",
	"CONTRAFACTUM",
	"TRANSLYRICS",
	"REMIX",
	"REMASTER",
	"MASHUP",
	"INSTRUMENTAL",
	"OTHERS",
]);

export type SongType = z.infer<typeof SongTypeSchema>;

export const PlatformSchema = z.enum([
	"YOUTUBE",
	"NICONICO",
	"BILIBILI",
	"VOCALOID_WIKI",
	"VOCALOID_LYRICS_WIKI",
	"SOUNDCLOUD",
	"NETEASE_MUSIC",
	"QQ_MUSIC",
	"FIVE_SING",
	"KUGOU",
	"SPOTIFY",
	"APPLE_MUSIC",
	"YOUTUBE_MUSIC",
	"WIKIPEDIA",
	"BAIDU_BAIKE",
	"PIXIV",
	"WEIBO",
	"TWITTER",
	"VOCADB",
	"MOEGIRLPEDIA",
	"MUSICBRAINZ",
	"VCPEDIA",
	"XIAOHONGSHU",
]);

export type Platform = z.infer<typeof PlatformSchema>;

export const CreateCreationSchema = z.object({
	artistId: z.int().positive(),
	roleId: z.int().positive(),
});

export type CreateCreationDto = z.infer<typeof CreateCreationSchema>;

export const CreatePerformanceSchema = z.object({
	singerId: z.int().positive(),
	voicebankId: z.int().positive().optional(),
	svsEngineId: z.int().positive().optional(),
	svsEngineVersionId: z.int().positive().optional(),
});

export type CreatePerformanceDto = z.infer<typeof CreatePerformanceSchema>;

export const SongLyricsCreateRequestSchema = z.object({
	language: z.string().optional(),
	isTranslated: z.boolean().optional(),
	plainText: z.string().optional(),
	ttml: z.string().optional(),
	lrc: z.string().optional(),
});

export type SongLyricsCreateRequestDto = z.infer<typeof SongLyricsCreateRequestSchema>;

export const SongLyricsUpdateRequestSchema = z.object({
	language: z.string().optional(),
	isTranslated: z.boolean().optional(),
	plainText: z.string().optional(),
	ttml: z.string().optional(),
	lrc: z.string().optional(),
});

export type SongLyricsUpdateRequestDto = z.infer<typeof SongLyricsUpdateRequestSchema>;

export const SongLyricsResponseSchema = z.object({
	id: z.int(),
	language: z.string().nullable().optional(),
	isTranslated: z.boolean().nullable().optional(),
	plainText: z.string().nullable().optional(),
	ttml: z.string().nullable().optional(),
	lrc: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type SongLyricsResponseDto = z.infer<typeof SongLyricsResponseSchema>;

export const SongLyricsListResponseSchema = z.array(SongLyricsResponseSchema);
export type SongLyricsListResponseDto = z.infer<typeof SongLyricsListResponseSchema>;

export const SongExternalLinkCreateRequestSchema = z.object({
	label: z.string().optional().nullable(),
	url: z.string().min(1),
	platform: PlatformSchema.optional().nullable(),
	platformId: z.string().optional().nullable(),
});

export type SongExternalLinkCreateRequestDto = z.infer<typeof SongExternalLinkCreateRequestSchema>;

export const SongExternalLinkUpdateRequestSchema = z.object({
	label: z.string().optional().nullable(),
	url: z.string().min(1).optional(),
	platform: PlatformSchema.optional().nullable(),
	platformId: z.string().optional().nullable(),
});

export type SongExternalLinkUpdateRequestDto = z.infer<typeof SongExternalLinkUpdateRequestSchema>;

export const SongExternalLinkResponseSchema = z.object({
	id: z.int(),
	label: z.string().nullable().optional(),
	url: z.string(),
	platform: PlatformSchema.nullable().optional(),
	platformId: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type SongExternalLinkResponseDto = z.infer<typeof SongExternalLinkResponseSchema>;

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

export type CreateSongRequestDto = z.infer<typeof CreateSongRequestSchema>;

export const UpdateSongRequestSchema = z.object({
	name: z.string().optional(),
	type: SongTypeSchema.optional(),
	duration: z.int().optional(),
	description: z.string().optional(),
	coverUrl: z.url().optional(),
	publishedAt: z.iso.datetime().optional(),
});

export type UpdateSongRequestDto = z.infer<typeof UpdateSongRequestSchema>;

export const SongResponseSchema = z.object({
	id: z.int(),
	type: SongTypeSchema.nullable().optional(),
	originalSongId: z.int().nullable().optional(),
	language: z.string(),
	name: z.string().nullable().optional(),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	duration: z.int().nullable().optional(),
	description: z.string().nullable().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).nullable().optional(),
	bilibiliAid: z.number().nullable().optional(),
	bilibiliBvid: z.string().nullable().optional(),
	vocadbId: z.int().nullable().optional(),
	vcpediaId: z.int().nullable().optional(),
	moegirlId: z.int().nullable().optional(),
	coverUrl: z.string().nullable().optional(),
	publishedAt: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type SongResponseDto = z.infer<typeof SongResponseSchema>;

export const SingerInSongDetailsSchema = z.object({
	id: z.int(),
	name: z.string(),
	avatarUrl: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).nullable().optional(),
	language: z.string().default("zh"),
	engine: z.string().nullable().optional(),
});

export type SingerInSongDetailsDto = z.infer<typeof SingerInSongDetailsSchema>;

export const ArtistRoleInSongDetailsSchema = z.object({
	id: z.int(),
	name: z.string(),
	language: z.string().default("zh"),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	description: z.string().nullable().optional(),
});

export type ArtistRoleInSongDetailsDto = z.infer<typeof ArtistRoleInSongDetailsSchema>;

export const ArtistInSongDetailsSchema = z.object({
	id: z.int(),
	name: z.string(),
	avatarUrl: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).nullable().optional(),
	role: ArtistRoleInSongDetailsSchema,
});

export type ArtistInSongDetailsDto = z.infer<typeof ArtistInSongDetailsSchema>;

export const SongDetailsResponseSchema = SongResponseSchema.extend({
	singers: z.array(SingerInSongDetailsSchema),
	artists: z.array(ArtistInSongDetailsSchema),
	lyrics: z.array(SongLyricsResponseSchema),
	externalLinks: z.array(SongExternalLinkResponseSchema),
});

export type SongDetailsResponseDto = z.infer<typeof SongDetailsResponseSchema>;
