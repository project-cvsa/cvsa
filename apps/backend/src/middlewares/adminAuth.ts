import { Elysia } from "elysia";
import { AppError } from "@cvsa/contracts";
import { resolveAuthFromHeaders } from "@cvsa/authentication";

export const adminAuthMiddleware = new Elysia({ name: "adminAuthMiddleware" }).derive(
	{ as: "scoped" },
	async ({ headers }) => {
		const authContext = await resolveAuthFromHeaders(headers);
		if (!authContext) {
			throw new AppError("error.unauthorized", "UNAUTHORIZED", 401);
		}
		const { session, user, roleName } = authContext;
		if (roleName !== "OWNER" && roleName !== "admin") {
			throw new AppError("error.forbidden", "FORBIDDEN", 403);
		}
		return {
			session,
			user,
			roleName,
		};
	}
);
