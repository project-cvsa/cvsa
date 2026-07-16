import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongExternalLinkCreateRequestSchema,
	SongExternalLinkResponseSchema,
	songService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkCreateHandler = new Elysia({ name: "songExternalLinkCreateHandler" })
	.use(authMiddleware)
	.post(
		"/song/:id/external-link",
		async ({ body, params, status }) => {
			const link = await traceTask("songService.createExternalLink", async () => {
				return await songService.createExternalLink(params.id, body);
			});
			return status(201, link);
		},
		{
			body: SongExternalLinkCreateRequestSchema,
			detail: {
				summary: "Create Song External Link",
				description: "Add a new external link for a song. Requires authentication.",
			},
			response: {
				201: SongExternalLinkResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
		}
	);
