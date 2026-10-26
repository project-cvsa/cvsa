import { Elysia } from "elysia";
import {
	ArtistResponseSchema,
	CreateArtistRequestSchema,
	ErrorResponseSchema,
} from "@cvsa/contracts";
import { artistWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistCreateHandler = new Elysia({ name: "artistCreateHandler" })
	.use(authMiddleware)
	.post(
		"/artist",
		async ({ body, status, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const artist = await traceTask("artistWriter.create", async () => {
				const row = await artistWriter.create(actor, body);
				return ArtistResponseSchema.parse(transformPrismaResult(row));
			});
			return status(201, artist);
		},
		{
			body: CreateArtistRequestSchema,
			detail: {
				summary: "Create Artist",
				description: "Create a new artist entry in the catalog. Requires authentication.",
			},
			response: {
				201: ArtistResponseSchema,
				401: ErrorResponseSchema,
			},
		}
	);
