import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { ErrorResponseSchema } from "@cvsa/contracts";
import {
	LoginRequestSchema,
	LoginResponseSchema,
	toLoginResponse,
	userToLoginUserInfoDto,
	userService,
} from "@cvsa/authentication";
import { applySessionCookie } from "@/common/auth/sessionCookie";
import { traceTask } from "@/common/trace";

export const loginHandler = new Elysia().use(ip()).post(
	"/session",
	async ({ body, status, headers, cookie, ip }) => {
		const userAgent = headers["user-agent"] ?? null;

		const { user, token } = await traceTask("auth.signIn", async () => {
			return await userService.login(body, {
				ipAddress: ip,
				userAgent,
			});
		});

		await applySessionCookie(cookie, token);

		const userInfo = userToLoginUserInfoDto(user, token);
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
