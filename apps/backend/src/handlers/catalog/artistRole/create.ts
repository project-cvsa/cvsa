import { Elysia } from "elysia";
import {
	ArtistRoleResponseSchema,
	CreateArtistRoleRequestSchema,
	ErrorResponseSchema,
} from "@cvsa/contracts";
import { artistRoleWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistRoleCreateHandler = new Elysia({ name: "artistRoleCreateHandler" })
	.use(authMiddleware)
	.post(
		"/artist-role",
		async ({ body, status, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const role = await traceTask("artistRoleWriter.create", async () => {
				const row = await artistRoleWriter.create(actor, body);
				return ArtistRoleResponseSchema.parse(serializeResult(row));
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
