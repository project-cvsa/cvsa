import { Elysia } from "elysia";
import z from "zod";
import { embeddingManager } from "./embedding";
import type { treaty } from "@elysiajs/eden";

const EMBEDDING_HOST = process.env.HOST ?? "0.0.0.0";
const EMBEDDING_PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 14900;

export const app = new Elysia()
	.get("/health", () => ({
		status: embeddingManager ? "ok" : "degraded",
	}))
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
	);

if (process.env.NODE_ENV !== "test") {
	app.listen({ hostname: EMBEDDING_HOST, port: EMBEDDING_PORT });
}

export type EmbeddingApp = typeof app;
export type EmbeddingAppApi = ReturnType<typeof treaty<EmbeddingApp>>;
