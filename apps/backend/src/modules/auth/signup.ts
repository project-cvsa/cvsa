import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { rateLimit } from "elysia-rate-limit";
import {
	betterAuthToSignupUserInfoDto,
	SignupRequestSchema,
	signupRequestToBetterAuth,
	SignupResponseSchema,
	toSignUpResponse,
	ErrorResponseSchema,
} from "@project-cvsa/core";
import { RateLimitError, AppError } from "@common/error";
import { auth } from "@project-cvsa/core";

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
				body: signupRequestToBetterAuth(body),
				headers: Object.entries(headers).filter(
					(entry): entry is [string, string] => entry[1] !== undefined
				),
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

			const userInfo = betterAuthToSignupUserInfoDto(user, token);
			const response = toSignUpResponse(userInfo);

			return status(200, response);
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
