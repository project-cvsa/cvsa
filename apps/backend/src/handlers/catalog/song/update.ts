import { Elysia } from "elysia";
import { z } from "zod";
import { ErrorResponseSchema, SongResponseSchema, UpdateSongRequestSchema } from "@cvsa/contracts";
import { songWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const songUpdateHandler = new Elysia({ name: "songUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/song/:id",
		async ({ params, body, user, roleName, status }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const song = await traceTask("songWriter.update", async () => {
				const updated = await songWriter.update(principal, params.id, body);
				return SongResponseSchema.parse(serializeResult(updated));
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
