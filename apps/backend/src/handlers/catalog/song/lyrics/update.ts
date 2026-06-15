import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongLyricsUpdateRequestSchema,
	SongLyricsResponseSchema,
	songService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songLyricsUpdateHandler = new Elysia({ name: "songLyricsUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/song/:id/lyric/:lyricId",
		async ({ body, params, status }) => {
			const lyric = await traceTask("songService.updateLyric", async () => {
				return await songService.updateLyric(params.id, params.lyricId, body);
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
