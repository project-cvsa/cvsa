import { Elysia } from "elysia";
import { CreateSongRequestSchema, ErrorResponseSchema, SongResponseSchema } from "@cvsa/contracts";
import { songWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const songCreateHandler = new Elysia({ name: "songCreateHandler" }).use(authMiddleware).post(
	"/song",
	async ({ body, user, roleName, status }) => {
		const principal = createUserPrincipal({
			userId: user.id,
			roles: roleName ? [roleName] : [],
		});
		const song = await traceTask("songWriter.create", async () => {
			const created = await songWriter.create(principal, body);
			return SongResponseSchema.parse(serializeResult(created));
		});
		return status(201, song);
	},
	{
		body: CreateSongRequestSchema,
		detail: {
			summary: "Create Song",
			description: "Create a new song entry in the catalog. Requires authentication.",
		},
		response: {
			201: SongResponseSchema,
			401: ErrorResponseSchema,
		},
	}
);
