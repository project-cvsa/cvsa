import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongExternalLinkCreateRequestSchema,
	SongExternalLinkResponseSchema,
} from "@cvsa/contracts";
import { songExternalLinkWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkCreateHandler = new Elysia({
	name: "songExternalLinkCreateHandler",
})
	.use(authMiddleware)
	.post(
		"/song/:id/external-link",
		async ({ body, params, user, roleName, status }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const link = await traceTask("songExternalLinkWriter.create", async () => {
				const created = await songExternalLinkWriter.create(principal, params.id, body);
				return SongExternalLinkResponseSchema.parse(serializeResult(created));
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
