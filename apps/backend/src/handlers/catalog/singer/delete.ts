import { Elysia } from "elysia";
import { z } from "zod";
import { ErrorResponseSchema } from "@cvsa/contracts";
import { singerWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const singerDeleteHandler = new Elysia({ name: "singerDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/singer/:id",
		async ({ params, set, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			await traceTask("singerWriter.delete", async () => {
				await singerWriter.delete(actor, params.id);
			});
			set.status = 204;
			return null;
		},
		{
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Delete Singer",
				description:
					"Soft delete a singer from the catalog. Requires authentication. The singer record is marked as deleted but retained in the database for data integrity.",
			},
			response: {
				204: z.null(),
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
