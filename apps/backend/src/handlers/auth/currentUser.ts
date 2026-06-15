import { Elysia } from "elysia";
import {
	CurrentUserInfoSchema,
	betterAuthToCurrentUserInfoDto,
	ErrorResponseSchema,
} from "@cvsa/core";
import { authMiddleware } from "@/middlewares";
import { traceTask } from "@/common/trace";

export const getCurrentUserHandler = new Elysia().use(authMiddleware).get(
	"/me",
	async ({ status, session }) => {
		const userInfo = await traceTask("getCurrentUser", async () => {
			return betterAuthToCurrentUserInfoDto(session.user);
		});
		return status(200, userInfo);
	},
	{
		detail: {
			summary: "Get current user",
			description:
				"Retrieve the currently authenticated user's profile information. Requires a valid session cookie or a valid token in Authorization header.",
		},
		response: {
			200: CurrentUserInfoSchema,
			400: ErrorResponseSchema,
			401: ErrorResponseSchema,
			422: ErrorResponseSchema,
			500: ErrorResponseSchema,
		},
	}
);
