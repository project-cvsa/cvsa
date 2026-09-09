import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import {
	betterAuthToSignupUserInfoDto,
	SignupRequestSchema,
	signupRequestToBetterAuth,
	SignupResponseSchema,
	toSignUpResponse,
	ErrorResponseSchema,
	toBetterAuthHeaders,
	createSessionCookie,
} from "@cvsa/core";
import { AppError } from "@cvsa/core";
import { auth } from "@cvsa/core";
import { env } from "@cvsa/env";
import { traceTask } from "@/common/trace";

const DAY = 86400;

export const signupHandler = new Elysia().use(ip()).post(
	"/user",
	async ({ body, status, headers, cookie }) => {
		const { user, token } = await traceTask("auth.signUpEmail", async () => {
			return await auth.api.signUpEmail({
				body: signupRequestToBetterAuth(body),
				headers: toBetterAuthHeaders(headers),
			});
		});

		if (!token) {
			throw new AppError("error.signup.failed", "INTERNAL_SERVER_ERROR", 500, {
				cause: "Better Auth responded with no token",
			});
		}

		const sessionCookie = await createSessionCookie(token);
		const tokenCookie = cookie[sessionCookie.name];
		tokenCookie.value = sessionCookie.value;
		tokenCookie.httpOnly = true;
		tokenCookie.maxAge = 90 * DAY;
		tokenCookie.secure = env.NODE_ENV === "production";
		tokenCookie.sameSite = "lax";
		tokenCookie.domain = env.COOKIE_DOMAIN;

		const userInfo = betterAuthToSignupUserInfoDto(user, token);
		const response = toSignUpResponse(userInfo);

		return status(200, response);
	},
	{
		body: SignupRequestSchema,
		detail: {
			summary: "User Registration",
			description:
				"Register a new user account with email and password. Returns the created user info and sets an httpOnly authentication cookie.",
		},
		response: {
			200: SignupResponseSchema,
			400: ErrorResponseSchema,
			422: ErrorResponseSchema,
			429: ErrorResponseSchema,
			500: ErrorResponseSchema,
		},
	}
);
