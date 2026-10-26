import { Elysia } from "elysia";
import { ErrorResponseSchema } from "@cvsa/contracts";
import { songLyricsWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";
import z from "zod";

export const songLyricsDeleteHandler = new Elysia({ name: "songLyricsDeleteHandler" })
	.use(authMiddleware)
	.delete(
		"/song/:id/lyric/:lyricId",
		async ({ params, user, roleName, set }) => {
			const principal = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			await traceTask("songLyricsWriter.delete", async () => {
				return await songLyricsWriter.delete(principal, params.id, params.lyricId);
			});
			set.status = 204;
			return null;
		},
		{
			detail: {
				summary: "Delete Song Lyric",
				description: "Delete a specific lyrics item for a song. Requires authentication.",
			},
			response: {
				204: z.null(),
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
			params: z.object({
				id: z.coerce.number().int().positive(),
				lyricId: z.coerce.number().int().positive(),
			}),
		}
	);
