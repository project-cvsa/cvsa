import { Elysia } from "elysia";
import { ErrorResponseSchema, ArtistDetailsResponseSchema, artistService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const artistDetailsHandler = new Elysia().get(
	"/artist/:id",
	async ({ params, status }) => {
		const artist = await traceTask("artistService.getDetails", async () => {
			return await artistService.getDetails(params.id);
		});
		return status(200, artist);
	},
	{
		detail: {
			summary: "Artist Details",
			description:
				"Retrieve detailed information about a specific artist by its ID. Includes name, description, aliases, and metadata.",
		},
		response: {
			200: ArtistDetailsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
