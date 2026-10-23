import { Elysia } from "elysia";
import { AppError, ArtistRoleDetailsResponseSchema, ErrorResponseSchema } from "@cvsa/contracts";
import { artistRoleReader } from "@cvsa/catalog";
import z from "zod";
import { traceTask } from "@/common/trace";

export const artistRoleDetailsHandler = new Elysia().get(
	"/artist-role/:id",
	async ({ params, status }) => {
		const role = await traceTask("artistRoleReader.getDetails", async () => {
			const res = await artistRoleReader.getDetails(params.id);
			if (!res) {
				throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
			}
			return res;
		});
		return status(200, role);
	},
	{
		detail: {
			summary: "Artist Role Details",
			description: "Retrieve detailed information about a specific artist role by its ID.",
		},
		response: {
			200: ArtistRoleDetailsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
