import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongExternalLinkResponseSchema,
	SongExternalLinkUpdateRequestSchema,
} from "@cvsa/contracts";
import { songExternalLinkWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkUpdateHandler = new Elysia({
	name: "songExternalLinkUpdateHandler",
})
	.use(authMiddleware)
	.patch(
		"/song/:id/external-link/:linkId",
		async ({ body, params, user, roleName, status }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const link = await traceTask("songExternalLinkWriter.update", async () => {
				const updated = await songExternalLinkWriter.update(
					principal,
					params.id,
					params.linkId,
					body
				);
				return SongExternalLinkResponseSchema.parse(transformPrismaResult(updated));
			});
			return status(200, link);
		},
		{
			body: SongExternalLinkUpdateRequestSchema,
			detail: {
				summary: "Update Song External Link",
				description: "Update a specific external link for a song. Requires authentication.",
			},
			response: {
				200: SongExternalLinkResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
			params: z.object({
				id: z.coerce.number().int().positive(),
				linkId: z.coerce.number().int().positive(),
			}),
		}
	);
