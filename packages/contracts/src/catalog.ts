import { z } from "zod";

// Artist
export const ArtistSchema = z.object({
	id: z.number().int(),
	name: z.string().nullable().optional(),
	avatarUrl: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).nullable().optional(),
	userId: z.string().nullable().optional(),
	aliases: z.array(z.string()).default([]),
	language: z.string().default("zh"),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable().optional(),
});

export const ArtistResponseSchema = ArtistSchema.omit({ deletedAt: true });
export const ArtistDetailsResponseSchema = ArtistResponseSchema;

export type ArtistResponseDto = z.infer<typeof ArtistResponseSchema>;
export type ArtistDetailsResponseDto = z.infer<typeof ArtistDetailsResponseSchema>;

export const CreateArtistRequestSchema = z.object({
	name: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	language: z.string().optional(),
	aliases: z.array(z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});
export type CreateArtistRequestDto = z.infer<typeof CreateArtistRequestSchema>;

export const UpdateArtistRequestSchema = z.object({
	name: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	language: z.string().optional(),
	aliases: z.array(z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});
export type UpdateArtistRequestDto = z.infer<typeof UpdateArtistRequestSchema>;

// Singer
export const SingerSchema = z.object({
	id: z.number().int(),
	name: z.string().nullable().optional(),
	avatarUrl: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).nullable().optional(),
	language: z.string().default("zh"),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable().optional(),
});

export const SingerResponseSchema = SingerSchema.omit({ deletedAt: true });
export const SingerDetailsResponseSchema = SingerResponseSchema;

export type SingerResponseDto = z.infer<typeof SingerResponseSchema>;
export type SingerDetailsResponseDto = z.infer<typeof SingerDetailsResponseSchema>;

export const CreateSingerRequestSchema = z.object({
	name: z.string().optional(),
	avatarUrl: z.string().optional(),
	description: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
	language: z.string().optional(),
});
export type CreateSingerRequestDto = z.infer<typeof CreateSingerRequestSchema>;

export const UpdateSingerRequestSchema = z.object({
	name: z.string().optional(),
	avatarUrl: z.string().optional(),
	description: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
	language: z.string().optional(),
});
export type UpdateSingerRequestDto = z.infer<typeof UpdateSingerRequestSchema>;

// ArtistRole
export const ArtistRoleSchema = z.object({
	id: z.number().int(),
	name: z.string(),
	language: z.string().default("zh"),
	localizedNames: z.record(z.string(), z.string()).nullable().optional(),
	description: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable().optional(),
});

export const ArtistRoleResponseSchema = ArtistRoleSchema.omit({ deletedAt: true });
export const ArtistRoleDetailsResponseSchema = ArtistRoleResponseSchema;

export type ArtistRoleResponseDto = z.infer<typeof ArtistRoleResponseSchema>;
export type ArtistRoleDetailsResponseDto = z.infer<typeof ArtistRoleDetailsResponseSchema>;

export const CreateArtistRoleRequestSchema = z.object({
	name: z.string().min(1),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	description: z.string().optional(),
});
export type CreateArtistRoleRequestDto = z.infer<typeof CreateArtistRoleRequestSchema>;

export const UpdateArtistRoleRequestSchema = z.object({
	name: z.string().min(1).optional(),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	description: z.string().optional(),
});
export type UpdateArtistRoleRequestDto = z.infer<typeof UpdateArtistRoleRequestSchema>;

// SvsEngine
export const SvsEngineSchema = z.object({
	id: z.number().int(),
	name: z.string(),
	description: z.string().nullable().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable().optional(),
});

export const EngineResponseSchema = SvsEngineSchema.omit({ deletedAt: true });
export const EngineDetailsResponseSchema = EngineResponseSchema;

export type EngineResponseDto = z.infer<typeof EngineResponseSchema>;
export type EngineDetailsResponseDto = z.infer<typeof EngineDetailsResponseSchema>;

export const CreateEngineRequestSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});
export type CreateEngineRequestDto = z.infer<typeof CreateEngineRequestSchema>;

export const UpdateEngineRequestSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});
export type UpdateEngineRequestDto = z.infer<typeof UpdateEngineRequestSchema>;
