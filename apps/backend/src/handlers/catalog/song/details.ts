import { Elysia } from "elysia";
import { AppError, ErrorResponseSchema, SongDetailsResponseSchema } from "@cvsa/contracts";
import { songReader } from "@cvsa/catalog";
import { transformPrismaResult } from "@cvsa/db";
import z from "zod";
import { traceTask } from "@/common/trace";

export const songDetailsHandler = new Elysia().get(
	"/song/:id/details",
	async ({ params, status }) => {
		const song = await traceTask("songReader.getDetails", async () => {
			const details = await songReader.getDetails(params.id);
			if (!details) {
				throw new AppError("error.song.notfound", "NOT_FOUND", 404);
			}
			return SongDetailsResponseSchema.parse(transformPrismaResult(details));
		});
		return status(200, song);
	},
	{
		detail: {
			summary: "Song Details",
			description:
				"Retrieve detailed information about a specific song by its ID. Includes all metadata such as title, artists, album, duration, and audio sources.",
		},
		response: {
			200: SongDetailsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
