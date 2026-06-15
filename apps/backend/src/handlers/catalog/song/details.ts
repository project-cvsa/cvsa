import { Elysia } from "elysia";
import { ErrorResponseSchema, SongDetailsResponseSchema, songService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const songDetailsHandler = new Elysia().get(
	"/song/:id/details",
	async ({ params, status }) => {
		const song = await traceTask("songService.getDetails", async () => {
			return await songService.getDetails(params.id);
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
