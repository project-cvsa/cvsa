import { z } from "zod";

export const EmbeddingRequestSchema = z.object({ texts: z.array(z.string()) });
export const EmbeddingResponseSchema = z.object({ embeddings: z.array(z.array(z.number())) });
export const EmbeddingErrorSchema = z.object({ message: z.string() });
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;
