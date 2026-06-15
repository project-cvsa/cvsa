import { Elysia } from "elysia";
import { ErrorResponseSchema, SongLyricsResponseSchema, songService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const songLyricsGetHandler = new Elysia().get(
	"/song/:id/lyric/:lyricId",
	async ({ params, status }) => {
		const lyric = await traceTask("songService.getLyric", async () => {
			return await songService.getLyric(params.id, params.lyricId);
		});
		return status(200, lyric);
	},
	{
		detail: {
			summary: "Get Song Lyric",
			description: "Retrieve a specific lyrics item for a song by its ID.",
		},
		response: {
			200: SongLyricsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
			lyricId: z.coerce.number().int().positive(),
		}),
	}
);
