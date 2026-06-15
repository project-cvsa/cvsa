import { Elysia } from "elysia";
import { ErrorResponseSchema, SingerDetailsResponseSchema, singerService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const singerGetHandler = new Elysia().get(
	"/singer/:id",
	async ({ params, status }) => {
		const singer = await traceTask("singerService.getDetails", async () => {
			return await singerService.getDetails(params.id);
		});
		return status(200, singer);
	},
	{
		detail: {
			summary: "Get Singer",
			description:
				"Retrieve detailed information about a specific singer by its ID. Includes name, description, language, and metadata.",
		},
		response: {
			200: SingerDetailsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
