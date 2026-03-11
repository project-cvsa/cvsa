import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { rateLimit } from "elysia-rate-limit";
import { SignupRequestSchema, SignupResponseSchema } from "@modules/auth/schema";
import { ErrorResponseSchema } from "@common/schemas";
import { RateLimitError, AppError } from "@common/error";
import { auth } from "@modules/auth/lib";
import { getRandomId } from "@common/utils";

const DAY = 86400;

export const signupHandler = new Elysia()
	.use(ip())
	.use(
		rateLimit({
			scoping: "global",
			max: 50,
			duration: 5 * 60 * 1000,
			generator: () => "", // global limit
			errorResponse: new RateLimitError(),
		})
	)
	.post(
		"/user",
		async ({ body, status, headers, cookie: { token: tokenCookie } }) => {
			const { user, token } = await auth.api.signUpEmail({
				body: {
					name: body.displayName || body.username,
					email:
						body.email || `delegate-${getRandomId(14).toLowerCase()}@projectcvsa.com`,
					password: body.password,
					username: body.username,
				},
				headers: headers,
			});
			if (!token) {
				throw new AppError("Cannot create user", "INTERNAL_SERVER_ERROR", 500, {
					cause: "Better Auth responded with no token",
				});
			}

			tokenCookie.value = token;
			tokenCookie.httpOnly = true;
			tokenCookie.maxAge = 90 * DAY;
			tokenCookie.secure = true;
			tokenCookie.sameSite = "lax";

			return status(200, {
				message: "Successfully registered",
				data: {
					id: user.id,
					username: user.username || "",
					displayName: user.name,
					email: user.email,
					token,
				},
			});
		},
		{
			body: SignupRequestSchema,
			detail: {
				summary: "User Registration",
				description: "",
			},
			response: {
				200: SignupResponseSchema,
				400: ErrorResponseSchema,
				422: ErrorResponseSchema,
				500: ErrorResponseSchema,
			},
		}
	);
