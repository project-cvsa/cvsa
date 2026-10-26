import { Elysia } from "elysia";
import { AppError, ErrorResponseSchema, SongLyricsListResponseSchema } from "@cvsa/contracts";
import { songReader } from "@cvsa/catalog";
import { transformPrismaResult } from "@cvsa/db";
import z from "zod";
import { traceTask } from "@/common/trace";

export const songLyricsListHandler = new Elysia().get(
	"/song/:id/lyrics",
	async ({ params, status }) => {
		const song = await songReader.getById(params.id);
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		const lyrics = await traceTask("songReader.listLyrics", async () => {
			const list = await songReader.listLyrics(params.id);
			return SongLyricsListResponseSchema.parse(transformPrismaResult(list));
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
