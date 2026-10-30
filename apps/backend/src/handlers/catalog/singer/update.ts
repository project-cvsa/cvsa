import { Elysia } from "elysia";
import { z } from "zod";
import {
	ErrorResponseSchema,
	SingerResponseSchema,
	UpdateSingerRequestSchema,
} from "@cvsa/contracts";
import { singerWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const singerUpdateHandler = new Elysia({ name: "singerUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/singer/:id",
		async ({ params, body, status, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const singer = await traceTask("singerWriter.update", async () => {
				const row = await singerWriter.update(actor, params.id, body);
				return SingerResponseSchema.parse(serializeResult(row));
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
