import { Elysia } from "elysia";
import { ErrorResponseSchema, EngineDetailsResponseSchema, engineService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

export const engineDetailsHandler = new Elysia().get(
	"/engine/:id/details",
	async ({ params, status }) => {
		const engine = await traceTask("engineService.getDetails", async () => {
			return await engineService.getDetails(params.id);
		});
		return status(200, engine);
	},
	{
		detail: {
			summary: "Engine Details",
			description:
				"Retrieve detailed information about a specific SVS engine by its ID. Includes name, description, and metadata.",
		},
		response: {
			200: EngineDetailsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
