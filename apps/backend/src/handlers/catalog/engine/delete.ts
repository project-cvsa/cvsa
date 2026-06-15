import { Elysia } from "elysia";
import { z } from "zod";
import { ErrorResponseSchema, engineService } from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const engineDeleteHandler = new Elysia({ name: "engineDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/engine/:id",
		async ({ params, set }) => {
			await traceTask("engineService.delete", async () => {
				return await engineService.delete(params.id);
			});
			set.status = 204;
			return null;
		},
		{
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Delete Engine",
				description:
					"Soft delete an SVS engine from the catalog. Requires authentication. The engine record is marked as deleted but retained in the database for data integrity.",
			},
			response: {
				204: z.null(),
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
