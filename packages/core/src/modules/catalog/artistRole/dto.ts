import { z } from "zod";
import { ArtistRoleSchema, type Serialized } from "@cvsa/db";

export type ArtistRoleId = number;

export const CreateArtistRoleRequestSchema = z.object({
	name: z.string(),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
});

export const UpdateArtistRoleRequestSchema = z.object({
	name: z.string().optional(),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
});

export const ArtistRoleResponseSchema = ArtistRoleSchema.omit({ deletedAt: true });

export const ArtistRoleDetailsResponseSchema = ArtistRoleResponseSchema;

export type ArtistRoleResponseDto = Serialized<z.infer<typeof ArtistRoleResponseSchema>>;
export type ArtistRoleDetailsResponseDto = Serialized<
	z.infer<typeof ArtistRoleDetailsResponseSchema>
>;
export type CreateArtistRoleRequestDto = Serialized<z.infer<typeof CreateArtistRoleRequestSchema>>;
export type UpdateArtistRoleRequestDto = Serialized<z.infer<typeof UpdateArtistRoleRequestSchema>>;
