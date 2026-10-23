import { Elysia } from "elysia";
import { AppError } from "@cvsa/contracts";
import { auth, betterAuthUserToEntity, toBetterAuthHeaders } from "@cvsa/authentication";

export const authMiddleware = new Elysia({ name: "authMiddleware" }).derive(
	{ as: "scoped" },
	async ({ headers }) => {
		const session = await auth.api.getSession({
			headers: toBetterAuthHeaders(headers),
		});

		if (!session) {
			throw new AppError("error.unauthorized", "UNAUTHORIZED", 401);
		}

		return {
			session,
			user: betterAuthUserToEntity(session.user),
		};
	}
);
