import { Elysia } from "elysia";
import { z } from "zod";
import {
	UpdateArtistRequestSchema,
	ErrorResponseSchema,
	artistService,
	ArtistResponseSchema,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistUpdateHandler = new Elysia({ name: "artistUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/artist/:id",
		async ({ params, body, status }) => {
			const artist = await traceTask("artistService.update", async () => {
				return await artistService.update(params.id, body);
			});
			return status(200, artist);
		},
		{
			body: UpdateArtistRequestSchema,
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Update Artist",
				description:
					"Update metadata of an existing artist identified by its ID. Requires authentication.",
			},
			response: {
				200: ArtistResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
