import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongExternalLinkUpdateRequestSchema,
	SongExternalLinkResponseSchema,
	songService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkUpdateHandler = new Elysia({ name: "songExternalLinkUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/song/:id/external-link/:linkId",
		async ({ body, params, status }) => {
			const link = await traceTask("songService.updateExternalLink", async () => {
				return await songService.updateExternalLink(params.id, params.linkId, body);
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
