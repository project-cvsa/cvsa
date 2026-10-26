import { Elysia } from "elysia";
import { ErrorResponseSchema } from "@cvsa/contracts";
import { songExternalLinkWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkDeleteHandler = new Elysia({
	name: "songExternalLinkDeleteHandler",
})
	.use(authMiddleware)
	.delete(
		"/song/:id/external-link/:linkId",
		async ({ params, user, roleName, set }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			await traceTask("songExternalLinkWriter.delete", async () => {
				return await songExternalLinkWriter.delete(principal, params.id, params.linkId);
			});
			set.status = 204;
			return null;
		},
		{
			detail: {
				summary: "Delete Song External Link",
				description: "Delete a specific external link for a song. Requires authentication.",
			},
			response: {
				204: z.null(),
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
