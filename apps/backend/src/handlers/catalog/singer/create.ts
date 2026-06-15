import { Elysia } from "elysia";
import {
	CreateSingerRequestSchema,
	ErrorResponseSchema,
	SingerResponseSchema,
	singerService,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const singerCreateHandler = new Elysia({ name: "singerCreateHandler" })
	.use(authMiddleware)
	.post(
		"/singer",
		async ({ body, status }) => {
			const singer = await traceTask("singerService.create", async () => {
				return await singerService.create(body);
			});
			return status(201, singer);
		},
		{
			body: CreateSingerRequestSchema,
			detail: {
				summary: "Create Singer",
				description: "Create a new singer entry in the catalog. Requires authentication.",
			},
			response: {
				201: SingerResponseSchema,
				401: ErrorResponseSchema,
			},
		}
	);
