import { Elysia } from "elysia";
import {
	CreateArtistRequestSchema,
	ErrorResponseSchema,
	ArtistResponseSchema,
	artistService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const artistCreateHandler = new Elysia({ name: "artistCreateHandler" })
	.use(authMiddleware)
	.post(
		"/artist",
		async ({ body, status }) => {
			const artist = await traceTask("artistService.create", async () => {
				return await artistService.create(body);
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
