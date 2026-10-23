import { Elysia } from "elysia";
import {
	CreateEngineRequestSchema,
	EngineResponseSchema,
	ErrorResponseSchema,
} from "@cvsa/contracts";
import { engineWriter } from "@cvsa/catalog";
import { createUserPrincipal } from "@cvsa/authentication";
import { transformPrismaResult } from "@cvsa/db";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const engineCreateHandler = new Elysia({ name: "engineCreateHandler" })
	.use(authMiddleware)
	.post(
		"/engine",
		async ({ body, status, user }) => {
			const actor = createUserPrincipal({
				userId: user.id,
				roles: user.roleId ? [String(user.roleId)] : [],
			});
			const engine = await traceTask("engineWriter.create", async () => {
				const row = await engineWriter.create(actor, body);
				return EngineResponseSchema.parse(transformPrismaResult(row));
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
