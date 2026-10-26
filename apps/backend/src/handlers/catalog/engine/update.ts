import { Elysia } from "elysia";
import { z } from "zod";
import {
	EngineResponseSchema,
	ErrorResponseSchema,
	UpdateEngineRequestSchema,
} from "@cvsa/contracts";
import { engineWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const engineUpdateHandler = new Elysia({ name: "engineUpdateHandler" })
	.use(authMiddleware)
	.patch(
		"/engine/:id",
		async ({ params, body, status, user, roleName }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: roleName ? [roleName] : [],
			});
			const engine = await traceTask("engineWriter.update", async () => {
				const row = await engineWriter.update(actor, params.id, body);
				return EngineResponseSchema.parse(transformPrismaResult(row));
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
