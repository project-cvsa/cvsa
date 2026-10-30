import { Elysia } from "elysia";
import { z } from "zod";
import {
	ArtistResponseSchema,
	ErrorResponseSchema,
	UpdateArtistRequestSchema,
} from "@cvsa/contracts";
import { artistWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistUpdateHandler = new Elysia({ name: "artistUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/artist/:id",
		async ({ params, body, status, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const artist = await traceTask("artistWriter.update", async () => {
				const row = await artistWriter.update(actor, params.id, body);
				return ArtistResponseSchema.parse(serializeResult(row));
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
