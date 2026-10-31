import { Elysia } from "elysia";
import {
	CreateSingerRequestSchema,
	ErrorResponseSchema,
	SingerResponseSchema,
} from "@cvsa/contracts";
import { singerWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { serializeResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const singerCreateHandler = new Elysia({ name: "singerCreateHandler" })
	.use(authMiddleware)
	.post(
		"/singer",
		async ({ body, status, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const singer = await traceTask("singerWriter.create", async () => {
				const row = await singerWriter.create(actor, body);
				return SingerResponseSchema.parse(serializeResult(row));
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
