import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongLyricsResponseSchema,
	SongLyricsUpdateRequestSchema,
} from "@cvsa/contracts";
import { songLyricsWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songLyricsUpdateHandler = new Elysia({ name: "songLyricsUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/song/:id/lyric/:lyricId",
		async ({ body, params, user, roleName, status }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const lyric = await traceTask("songLyricsWriter.update", async () => {
				const updated = await songLyricsWriter.update(
					principal,
					params.id,
					params.lyricId,
					body
				);
				return SongLyricsResponseSchema.parse(transformPrismaResult(updated));
			});
			return status(200, lyric);
		},
		{
			body: SongLyricsUpdateRequestSchema,
			detail: {
				summary: "Update Song Lyric",
				description: "Update a specific lyrics item for a song. Requires authentication.",
			},
			response: {
				200: SongLyricsResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
			params: z.object({
				id: z.coerce.number().int().positive(),
				lyricId: z.coerce.number().int().positive(),
			}),
		}
	);
