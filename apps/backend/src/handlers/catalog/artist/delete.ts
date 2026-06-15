import { Elysia } from "elysia";
import { z } from "zod";
import { ErrorResponseSchema, artistService } from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistDeleteHandler = new Elysia({ name: "artistDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/artist/:id",
		async ({ params, set }) => {
			await traceTask("artistService.delete", async () => {
				return await artistService.delete(params.id);
			});
			set.status = 204;
			return null;
		},
		{
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Delete Artist",
				description:
					"Soft delete an artist from the catalog. Requires authentication. The artist record is marked as deleted but retained in the database for data integrity.",
			},
			response: {
				204: z.null(),
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
