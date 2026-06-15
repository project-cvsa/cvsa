import { Elysia } from "elysia";
import { z } from "zod";
import { ErrorResponseSchema, songService } from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const songDeleteHandler = new Elysia({ name: "songDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/song/:id",
		async ({ params, set }) => {
			await traceTask("songService.delete", async () => {
				return await songService.delete(params.id);
			});
			set.status = 204;
			return null;
		},
		{
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Delete Song",
				description:
					"Soft delete a song from the catalog. Requires authentication. The song record is marked as deleted but retained in the database for data integrity.",
			},
			response: {
				204: z.null(),
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
