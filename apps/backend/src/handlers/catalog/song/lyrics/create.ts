import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongLyricsCreateRequestSchema,
	SongLyricsResponseSchema,
	songService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songLyricsCreateHandler = new Elysia({ name: "songLyricsCreateHandler" })
	.use(authMiddleware)
	.post(
		"/song/:id/lyric",
		async ({ body, params, status }) => {
			const lyric = await traceTask("songService.createLyric", async () => {
				return await songService.createLyric(params.id, body);
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
