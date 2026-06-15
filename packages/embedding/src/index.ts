import { Elysia } from "elysia";
import z from "zod";
import { embeddingManager } from "./embedding";
import type { treaty } from "@elysiajs/eden";

export const app = new Elysia()
	.post(
		"/embeddings",
		async ({ body, status }) => {
			const { texts } = body;
			const embeddings = await embeddingManager?.getEmbedding(texts);
			if (!embeddings) {
				return status(500, { message: "cannot generate embedding" });
			}
			return status(200, {
				embeddings,
			});
		},
		{
			body: z.object({
				texts: z.string().array(),
			}),
			response: {
				200: z.object({
					embeddings: z.number().array().array(),
				}),
				500: z.object({
					message: z.string(),
				}),
			},
		}
	)
	.listen(14900);
export type EmbeddingApp = typeof app;
export type EmbeddingAppApi = ReturnType<typeof treaty<EmbeddingApp>>;
