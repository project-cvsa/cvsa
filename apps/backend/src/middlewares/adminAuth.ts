import { Elysia } from "elysia";
import { AppError } from "@cvsa/contracts";
import { getRoleNameById } from "@cvsa/authentication";
import { authMiddleware } from "./auth";

export const adminAuthMiddleware = new Elysia({ name: "adminAuthMiddleware" })
	.use(authMiddleware)
	.derive({ as: "scoped" }, async ({ user }) => {
		if (!user?.roleId) {
			throw new AppError("error.forbidden", "FORBIDDEN", 403);
		}
		const roleName = await getRoleNameById(user.roleId);
		if (roleName !== "OWNER" && roleName !== "admin") {
			throw new AppError("error.forbidden", "FORBIDDEN", 403);
		}
		return {
			roleName,
		};
	});
