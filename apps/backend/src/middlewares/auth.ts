import { Elysia } from "elysia";
import { AppError } from "@cvsa/contracts";
import { resolveAuthFromHeaders } from "@cvsa/authentication";

export const authMiddleware = new Elysia({ name: "authMiddleware" }).derive(
	{ as: "scoped" },
	async ({ headers }) => {
		const authContext = await resolveAuthFromHeaders(headers);

		if (!authContext) {
			throw new AppError("error.unauthorized", "UNAUTHORIZED", 401);
		}

		return {
			session: authContext.session,
			user: authContext.user,
		};
	}
);
