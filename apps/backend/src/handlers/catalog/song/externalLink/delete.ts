import { Elysia } from "elysia";
import { ErrorResponseSchema, songService } from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkDeleteHandler = new Elysia({ name: "songExternalLinkDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/song/:id/external-link/:linkId",
		async ({ params, set }) => {
			await traceTask("songService.deleteExternalLink", async () => {
				return await songService.deleteExternalLink(params.id, params.linkId);
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
