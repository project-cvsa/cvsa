import { Elysia } from "elysia";
import {
	CreateArtistRoleRequestSchema,
	ErrorResponseSchema,
	ArtistRoleResponseSchema,
	artistRoleService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistRoleCreateHandler = new Elysia({ name: "artistRoleCreateHandler" })
	.use(authMiddleware)
	.post(
		"/artist-role",
		async ({ body, status }) => {
			const role = await traceTask("artistRoleService.create", async () => {
				return await artistRoleService.create(body);
			});
			return status(201, role);
		},
		{
			body: CreateArtistRoleRequestSchema,
			detail: {
				summary: "Create Artist Role",
				description:
					"Create a new artist role entry in the catalog. Requires authentication.",
			},
			response: {
				201: ArtistRoleResponseSchema,
				401: ErrorResponseSchema,
			},
		}
	);
