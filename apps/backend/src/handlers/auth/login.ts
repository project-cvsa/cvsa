import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import {
	AppError,
	auth,
	LoginRequestSchema,
	LoginResponseSchema,
	ErrorResponseSchema,
	betterAuthToLoginUserInfoDto,
	toLoginResponse,
	toBetterAuthHeaders,
	createSessionCookie,
} from "@cvsa/core";
import { env } from "@cvsa/env";
import { traceTask } from "@/common/trace";

const DAY = 86400;

export const loginHandler = new Elysia().use(ip()).post(
	"/session",
	async ({ body, status, headers, cookie }) => {
		const { user, token } = await traceTask("auth.signIn", async () => {
			const authHeaders = toBetterAuthHeaders(headers);
			// The identifier field accepts a username or an email; route to the matching endpoint.
			if (body.email.includes("@")) {
				return await auth.api.signInEmail({
					body: { email: body.email, password: body.password },
					headers: authHeaders,
				});
			}
			return await auth.api.signInUsername({
				body: { username: body.email, password: body.password },
				headers: authHeaders,
			});
		});

		if (!token) {
			throw new AppError("error.login.failed", "INTERNAL_SERVER_ERROR", 500, {
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

		const userInfo = betterAuthToLoginUserInfoDto(user, token);
		const response = toLoginResponse(userInfo);

		return status(200, response);
	},
	{
		body: LoginRequestSchema,
		detail: {
			summary: "User Login",
			description:
				"Authenticate an existing user with email and password credentials. Returns user info and sets an httpOnly authentication cookie.",
		},
		response: {
			200: LoginResponseSchema,
			401: ErrorResponseSchema,
			422: ErrorResponseSchema,
			429: ErrorResponseSchema,
			500: ErrorResponseSchema,
		},
	}
);
