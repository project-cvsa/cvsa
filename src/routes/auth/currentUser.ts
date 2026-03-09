import { Elysia } from "elysia";
import { GetCurrentUserResponseSchema } from "@schemas/auth";
import { ErrorResponseSchema } from "@schemas/common";
import z from "zod";
import { authService } from "@/containers";

const DUMMY_TOKEN = "000000000000000000000000000000.000000000000000000000000000000";
const DUMMY_BEARER_TOKEN = `Bearer ${DUMMY_TOKEN}`;

const authSchema = z
	.string()
	// Length: Bearer (7) + hex(30) + dot(1) + hex(30) = 68
	.length(68)
	.startsWith("Bearer ")
	.transform((val) => val.slice(7))
	.refine((token) => /^[0-9a-fA-F]{30}\.[0-9a-fA-F]{30}$/.test(token));

export const getCurrentUserHandler = new Elysia().decorate("authService", authService).get(
	"/me",
	async ({ headers, status, authService }) => {
		const auth = headers.authorization ?? DUMMY_BEARER_TOKEN;
		const parsedToken = authSchema.safeParse(auth);
		const token = parsedToken.success ? parsedToken.data : DUMMY_TOKEN;
		const user = await authService.verifyToken(token);

		if (!parsedToken.success || !user) {
			return status(401, { code: "UNAUTHORIZED", message: "Unauthorized" });
		}
		return status(200, {
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			email: user.email,
		});
	},
	{
		detail: {
			summary: "Get current user",
			description: "",
		},
		response: {
			200: GetCurrentUserResponseSchema,
			400: ErrorResponseSchema,
			401: ErrorResponseSchema,
			500: ErrorResponseSchema,
		},
	}
);
