import { z } from "zod";
import { ArtistSchema, type Serialized } from "@cvsa/db";

export type ArtistId = number;

export const CreateArtistRequestSchema = z.object({
	name: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	language: z.string().optional(),
	aliases: z.array(z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});

export const UpdateArtistRequestSchema = z.object({
	name: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	language: z.string().optional(),
	aliases: z.array(z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});

export const ArtistResponseSchema = ArtistSchema.omit({ deletedAt: true });

export const ArtistDetailsResponseSchema = ArtistResponseSchema;

export type ArtistResponseDto = Serialized<z.infer<typeof ArtistResponseSchema>>;
export type ArtistDetailsResponseDto = Serialized<z.infer<typeof ArtistDetailsResponseSchema>>;
export type CreateArtistRequestDto = Serialized<z.infer<typeof CreateArtistRequestSchema>>;
export type UpdateArtistRequestDto = Serialized<z.infer<typeof UpdateArtistRequestSchema>>;
