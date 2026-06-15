import { Elysia } from "elysia";
import { ErrorResponseSchema, SongLyricsListResponseSchema, songService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const songLyricsListHandler = new Elysia().get(
	"/song/:id/lyrics",
	async ({ params, status }) => {
		const lyrics = await traceTask("songService.listLyrics", async () => {
			return await songService.listLyrics(params.id);
		});
		return status(200, lyrics);
	},
	{
		detail: {
			summary: "List Song Lyrics",
			description: "Retrieve all available lyrics for a specific song by its ID.",
		},
		response: {
			200: SongLyricsListResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
