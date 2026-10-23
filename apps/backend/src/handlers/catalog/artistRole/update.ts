import { Elysia } from "elysia";
import { z } from "zod";
import {
	ArtistRoleResponseSchema,
	ErrorResponseSchema,
	UpdateArtistRoleRequestSchema,
} from "@cvsa/contracts";
import { artistRoleWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistRoleUpdateHandler = new Elysia({ name: "artistRoleUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/artist-role/:id",
		async ({ params, body, status, user }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: user.roleId ? [String(user.roleId)] : [],
			});
			const role = await traceTask("artistRoleWriter.update", async () => {
				const row = await artistRoleWriter.update(actor, params.id, body);
				return ArtistRoleResponseSchema.parse(transformPrismaResult(row));
			});
			return status(200, role);
		},
		{
			body: UpdateArtistRoleRequestSchema,
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Update Artist Role",
				description:
					"Update metadata of an existing artist role identified by its ID. Requires authentication.",
			},
			response: {
				200: ArtistRoleResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
