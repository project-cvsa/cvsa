import { Elysia } from "elysia";
import {
	EmbeddingRequestSchema,
	EmbeddingResponseSchema,
	EmbeddingErrorSchema,
} from "@cvsa/contracts";
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
			body: EmbeddingRequestSchema,
			response: { 200: EmbeddingResponseSchema, 500: EmbeddingErrorSchema },
		}
	);

if (process.env.NODE_ENV !== "test") {
	app.listen({ hostname: EMBEDDING_HOST, port: EMBEDDING_PORT });
}

export type EmbeddingApp = typeof app;
export type EmbeddingAppApi = ReturnType<typeof treaty<EmbeddingApp>>;
