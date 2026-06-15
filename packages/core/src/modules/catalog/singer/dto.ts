import { z } from "zod";
import { SingerSchema, type Serialized } from "@cvsa/db";

export type SingerId = number;

export const CreateSingerRequestSchema = z.object({
	name: z.string().optional(),
	avatarUrl: z.string().optional(),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});

export const UpdateSingerRequestSchema = z.object({
	name: z.string().optional(),
	avatarUrl: z.string().optional(),
	language: z.string().optional(),
	localizedNames: z.record(z.string(), z.string()).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});

export const SingerResponseSchema = SingerSchema.omit({ deletedAt: true });

export const SingerDetailsResponseSchema = SingerResponseSchema;

export type SingerResponseDto = Serialized<z.infer<typeof SingerResponseSchema>>;
export type SingerDetailsResponseDto = Serialized<z.infer<typeof SingerDetailsResponseSchema>>;
export type CreateSingerRequestDto = Serialized<z.infer<typeof CreateSingerRequestSchema>>;
export type UpdateSingerRequestDto = Serialized<z.infer<typeof UpdateSingerRequestSchema>>;
