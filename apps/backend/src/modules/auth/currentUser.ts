import { Elysia } from "elysia";
import {
	CurrentUserInfoSchema,
	betterAuthToCurrentUserInfoDto,
	ErrorResponseSchema,
} from "@project-cvsa/core";
import { authMiddleware } from "@common/middlewares";

export const getCurrentUserHandler = new Elysia().use(authMiddleware).get(
	"/me",
	async ({ status, session }) => {
		const userInfo = betterAuthToCurrentUserInfoDto(session.user);
		return status(200, userInfo);
	},
	{
		detail: {
			summary: "Get current user",
			description: "",
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
