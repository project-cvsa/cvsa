import { Elysia } from "elysia";
import {
	CreateEngineRequestSchema,
	ErrorResponseSchema,
	EngineResponseSchema,
	engineService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const engineCreateHandler = new Elysia({ name: "engineCreateHandler" })
	.use(authMiddleware)
	.post(
		"/engine",
		async ({ body, status }) => {
			const engine = await traceTask("engineService.create", async () => {
				return await engineService.create(body);
			});
			return status(201, engine);
		},
		{
			body: CreateEngineRequestSchema,
			detail: {
				summary: "Create Engine",
				description:
					"Create a new SVS engine entry in the catalog. Requires authentication.",
			},
			response: {
				201: EngineResponseSchema,
				401: ErrorResponseSchema,
			},
		}
	);
