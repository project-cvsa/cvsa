import { Elysia } from "elysia";
import { z } from "zod";
import { ErrorResponseSchema, artistRoleService } from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistRoleDeleteHandler = new Elysia({ name: "artistRoleDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/artist-role/:id",
		async ({ params, set }) => {
			await traceTask("artistRoleService.delete", async () => {
				return await artistRoleService.delete(params.id);
			});
			set.status = 204;
			return null;
		},
		{
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Delete Artist Role",
				description:
					"Soft delete an artist role from the catalog. Requires authentication. The role record is marked as deleted but retained in the database for data integrity.",
			},
			response: {
				204: z.null(),
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
