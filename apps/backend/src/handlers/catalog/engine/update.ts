import { Elysia } from "elysia";
import { z } from "zod";
import {
	UpdateEngineRequestSchema,
	ErrorResponseSchema,
	engineService,
	EngineResponseSchema,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const engineUpdateHandler = new Elysia({ name: "engineUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/engine/:id",
		async ({ params, body, status }) => {
			const engine = await traceTask("engineService.update", async () => {
				return await engineService.update(params.id, body);
			});
			return status(200, engine);
		},
		{
			body: UpdateEngineRequestSchema,
			params: z.object({
				id: z.coerce.number().int().positive(),
			}),
			detail: {
				summary: "Update Engine",
				description:
					"Update metadata of an existing SVS engine identified by its ID. Requires authentication.",
			},
			response: {
				200: EngineResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
