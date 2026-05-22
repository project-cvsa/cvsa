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
} from "@cvsa/core";
import { traceTask } from "@/common/trace";

const DAY = 86400;

export const loginHandler = new Elysia().use(ip()).post(
	"/session",
	async ({ body, status, headers, cookie: { token: tokenCookie } }) => {
		const { user, token } = await traceTask("auth.signInEmail", async () => {
			return await auth.api.signInEmail({
				body: {
					email: body.email,
					password: body.password,
				},
				headers: toBetterAuthHeaders(headers),
			});
		});

		if (!token) {
			throw new AppError("error.login.failed", "INTERNAL_SERVER_ERROR", 500, {
				cause: "Better Auth responded with no token",
			});
		}

		tokenCookie.value = token;
		tokenCookie.httpOnly = true;
		tokenCookie.maxAge = 90 * DAY;
		tokenCookie.secure = true;
		tokenCookie.sameSite = "lax";

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
