import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { ErrorResponseSchema } from "@cvsa/contracts";
import {
	SignupRequestSchema,
	SignupResponseSchema,
	toSignUpResponse,
	userToSignupUserInfoDto,
	userService,
} from "@cvsa/authentication";
import { applySessionCookie } from "@/common/auth/sessionCookie";
import { traceTask } from "@/common/trace";

export const signupHandler = new Elysia().use(ip()).post(
	"/user",
	async ({ body, status, headers, cookie, ip }) => {
		const userAgent = headers["user-agent"] ?? null;

		const { user, token } = await traceTask("auth.signUp", async () => {
			return await userService.signUp(body, {
				ipAddress: ip,
				userAgent,
			});
		});

		await applySessionCookie(cookie, token);

		const userInfo = userToSignupUserInfoDto(user, token);
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
			403: ErrorResponseSchema,
			422: ErrorResponseSchema,
			429: ErrorResponseSchema,
			500: ErrorResponseSchema,
		},
	}
);
