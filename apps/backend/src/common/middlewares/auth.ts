import { AppError } from "@common/error";
import { auth } from "@project-cvsa/core";
import { Elysia } from "elysia";
import type { User } from "@project-cvsa/db";

type BetterAuthUser = Exclude<Awaited<ReturnType<typeof auth.api.getSession>>, null>["user"];

const convertUser = (user: BetterAuthUser): User => {
	const { image, roleId } = user;
	return {
		...user,
		image: image || null,
		roleId: roleId || null,
		username: user.username || "",
		displayUsername: user.displayUsername || "",
	};
};

export const authMiddleware = new Elysia({ name: "authMiddleware" }).derive(
	{ as: "scoped" },
	async ({ headers }) => {
		const session = await auth.api.getSession({
			headers: Object.entries(headers).filter(
				(entry): entry is [string, string] => entry[1] !== undefined
			),
		});

		if (!session) {
			throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
		}

		return {
			session,
			user: convertUser(session.user) as User,
		};
	}
);
