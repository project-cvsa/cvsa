import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	SongExternalLinkCreateRequestSchema,
	SongExternalLinkResponseSchema,
} from "@cvsa/contracts";
import { songExternalLinkWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songExternalLinkCreateHandler = new Elysia({
	name: "songExternalLinkCreateHandler",
})
	.use(authMiddleware)
	.post(
		"/song/:id/external-link",
		async ({ body, params, user, status }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: user.roleId ? [String(user.roleId)] : [],
			});
			const link = await traceTask("songExternalLinkWriter.create", async () => {
				const created = await songExternalLinkWriter.create(principal, params.id, body);
				return SongExternalLinkResponseSchema.parse(transformPrismaResult(created));
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
