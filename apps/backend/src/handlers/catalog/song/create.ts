import { Elysia } from "elysia";
import {
	CreateSongRequestSchema,
	ErrorResponseSchema,
	SongResponseSchema,
	songService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const songCreateHandler = new Elysia({ name: "songCreateHandler" }).use(authMiddleware).post(
	"/song",
	async ({ body, status }) => {
		const song = await traceTask("songService.create", async () => {
			return await songService.create(body);
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
