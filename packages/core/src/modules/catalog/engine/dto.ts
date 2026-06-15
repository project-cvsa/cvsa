import { z } from "zod";
import { SvsEngineSchema, type Serialized } from "@cvsa/db";

export type EngineId = number;

export const CreateEngineRequestSchema = z.object({
	name: z.string().min(1).max(255),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});

export const UpdateEngineRequestSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().optional(),
	localizedDescriptions: z.record(z.string(), z.string()).optional(),
});

export const EngineResponseSchema = SvsEngineSchema.omit({ deletedAt: true });

export const EngineDetailsResponseSchema = EngineResponseSchema;

export type EngineResponseDto = Serialized<z.infer<typeof EngineResponseSchema>>;
export type EngineDetailsResponseDto = Serialized<z.infer<typeof EngineDetailsResponseSchema>>;
export type CreateEngineRequestDto = Serialized<z.infer<typeof CreateEngineRequestSchema>>;
export type UpdateEngineRequestDto = Serialized<z.infer<typeof UpdateEngineRequestSchema>>;
