import { Elysia } from "elysia";
import { AppError } from "@cvsa/contracts";
import { resolveAuthFromHeaders } from "@cvsa/authentication";

function createRoleAuthMiddleware(name: string, allowedRoles: readonly string[]) {
	return new Elysia({ name }).derive({ as: "scoped" }, async ({ headers }) => {
		const authContext = await resolveAuthFromHeaders(headers);
		if (!authContext) {
			throw new AppError("error.unauthorized", "UNAUTHORIZED", 401);
		}
		const { session, user, roleName } = authContext;
		if (!roleName || !allowedRoles.includes(roleName)) {
			throw new AppError("error.forbidden", "FORBIDDEN", 403);
		}
		return {
			session,
			user,
			roleName,
		};
	});
}

/** Allows OWNER, admin, and editor (read + labeling/annotation/curation/backfill/export). */
export const adminAuthMiddleware = createRoleAuthMiddleware("adminAuthMiddleware", [
	"OWNER",
	"admin",
	"editor",
]);

/** Restricts destructive, configuration, milestone, job-control, and operational mutations to OWNER/admin. */
export const crawlerAdminAuthMiddleware = createRoleAuthMiddleware("crawlerAdminAuthMiddleware", [
	"OWNER",
	"admin",
]);
