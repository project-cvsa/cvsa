import { Elysia } from "elysia";
import { z } from "zod";
import { authMiddleware } from "@/middlewares";
import { auth, ErrorResponseSchema, toBetterAuthHeaders, getSessionCookieName } from "@cvsa/core";
import { env } from "@cvsa/env";
import { traceTask } from "@/common/trace";

export const logoutHandler = new Elysia().use(authMiddleware).delete(
	"/session",
	async ({ set, headers, cookie }) => {
		await traceTask("auth.signOut", async () => {
			return await auth.api.signOut({
				headers: toBetterAuthHeaders(headers),
			});
		});

		const tokenCookie = cookie[await getSessionCookieName()];
		tokenCookie.value = "";
		tokenCookie.expires = new Date(0);
		tokenCookie.maxAge = 0;
		tokenCookie.httpOnly = true;
		tokenCookie.secure = env.NODE_ENV === "production";
		tokenCookie.sameSite = "lax";
		tokenCookie.domain = env.COOKIE_DOMAIN;

		set.status = 204;
		return null;
	},
	{
		detail: {
			summary: "User Logout",
			description:
				"Terminate the current user session. Removes the authentication cookie and invalidates the session server-side.",
		},
		response: {
			204: z.null(),
			401: ErrorResponseSchema,
		},
	}
);
