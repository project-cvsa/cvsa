import { Elysia } from "elysia";
import { AppError, ErrorResponseSchema, SongLyricsResponseSchema } from "@cvsa/contracts";
import { songReader } from "@cvsa/catalog";
import { transformPrismaResult } from "@cvsa/db";
import z from "zod";
import { traceTask } from "@/common/trace";

export const songLyricsGetHandler = new Elysia().get(
	"/song/:id/lyric/:lyricId",
	async ({ params, status }) => {
		const lyric = await traceTask("songReader.getLyric", async () => {
			const found = await songReader.getLyricById(params.id, params.lyricId);
			if (!found) {
				throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
			}
			return SongLyricsResponseSchema.parse(transformPrismaResult(found));
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
