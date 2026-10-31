import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongLyricsCreateRequestSchema,
	SongLyricsResponseSchema,
} from "@cvsa/contracts";
import { songLyricsWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songLyricsCreateHandler = new Elysia({ name: "songLyricsCreateHandler" })
	.use(authMiddleware)
	.post(
		"/song/:id/lyric",
		async ({ body, params, user, roleName, status }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const lyric = await traceTask("songLyricsWriter.create", async () => {
				const created = await songLyricsWriter.create(principal, params.id, body);
				return SongLyricsResponseSchema.parse(serializeResult(created));
			});
			return status(201, lyric);
		},
		{
			body: SongLyricsCreateRequestSchema,
			detail: {
				summary: "Create Song Lyric",
				description: "Add a new lyrics item for a song. Requires authentication.",
			},
			response: {
				201: SongLyricsResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
		}
	);
