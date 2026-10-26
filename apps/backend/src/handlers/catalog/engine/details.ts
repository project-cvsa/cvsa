import { Elysia } from "elysia";
import { AppError, EngineDetailsResponseSchema, ErrorResponseSchema } from "@cvsa/contracts";
import { engineReader } from "@cvsa/catalog";
import z from "zod";
import { traceTask } from "@/common/trace";

export const engineDetailsHandler = new Elysia().get(
	"/engine/:id/details",
	async ({ params, status }) => {
		const engine = await traceTask("engineReader.getDetails", async () => {
			const res = await engineReader.getDetails(params.id);
			if (!res) {
				throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
			}
			return res;
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
