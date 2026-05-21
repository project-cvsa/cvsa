import { Elysia } from "elysia";
import {
	ErrorResponseSchema,
	ArtistRoleDetailsResponseSchema,
	artistRoleService,
} from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const artistRoleDetailsHandler = new Elysia().get(
	"/artist-role/:id",
	async ({ params, status }) => {
		const role = await traceTask("artistRoleService.getDetails", async () => {
			return await artistRoleService.getDetails(params.id);
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
