import { Elysia } from "elysia";
import { z } from "zod";
import { authMiddleware } from "@/middlewares";
import { auth, ErrorResponseSchema, toBetterAuthHeaders } from "@cvsa/core";
import { traceTask } from "@/common/trace";

export const logoutHandler = new Elysia().use(authMiddleware).delete(
	"/session",
	async ({ set, headers, cookie: { token: tokenCookie } }) => {
		await traceTask("auth.signOut", async () => {
			return await auth.api.signOut({
				headers: toBetterAuthHeaders(headers),
			});
		});

		tokenCookie.remove();

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
		cookie: z.object({
			token: z.optional(z.string()),
		}),
	}
);
