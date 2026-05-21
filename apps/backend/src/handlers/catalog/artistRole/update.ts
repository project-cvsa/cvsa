import { Elysia } from "elysia";
import { z } from "zod";
import {
	UpdateArtistRoleRequestSchema,
	ErrorResponseSchema,
	artistRoleService,
	ArtistRoleResponseSchema,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistRoleUpdateHandler = new Elysia({ name: "artistRoleUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/artist-role/:id",
		async ({ params, body, status }) => {
			const role = await traceTask("artistRoleService.update", async () => {
				return await artistRoleService.update(params.id, body);
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
