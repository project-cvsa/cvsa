import { Elysia } from "elysia";
import { z } from "zod";
import {
	UpdateSingerRequestSchema,
	ErrorResponseSchema,
	singerService,
	SingerResponseSchema,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const singerUpdateHandler = new Elysia({ name: "singerUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/singer/:id",
		async ({ params, body, status }) => {
			const singer = await traceTask("singerService.update", async () => {
				return await singerService.update(params.id, body);
			});
			return status(200, singer);
		},
		{
			body: UpdateSingerRequestSchema,
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Update Singer",
				description:
					"Update metadata of an existing singer identified by its ID. Requires authentication.",
			},
			response: {
				200: SingerResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
