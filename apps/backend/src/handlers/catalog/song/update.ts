import { Elysia } from "elysia";
import { z } from "zod";
import {
	UpdateSongRequestSchema,
	ErrorResponseSchema,
	songService,
	SongResponseSchema,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const songUpdateHandler = new Elysia({ name: "songUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/song/:id",
		async ({ params, body, status }) => {
			const song = await traceTask("songService.update", async () => {
				return await songService.update(params.id, body);
			});
			return status(200, song);
		},
		{
			body: UpdateSongRequestSchema,
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Update Song",
				description:
					"Update metadata of an existing song identified by its ID. Requires authentication.",
			},
			response: {
				200: SongResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
