import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "@common/prisma";
import { getRandomId } from "@common/utils";
import { username } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";

const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	user: {
		additionalFields: {
			reputation: { type: "number", defaultValue: 0 },
			roleId: { type: "number", required: false },
		},
	},
	password: {
		hash: (password: string) =>
			Bun.password.hash(password, {
				algorithm: "argon2id",
				memoryCost: 4,
			}),
		verify: (password: string, hash: string) => Bun.password.verify(password, hash),
	},
	session: {
		expiresIn: 90 * DAY,
		updateAge: 1 * DAY,
		freshAge: 3 * HOUR,
		deferSessionRefresh: true,
	},
	advanced: {
		database: {
			generateId: (options) => {
				if (options.model === "user" || options.model === "users") {
					return getRandomId(7);
				}
				return getRandomId(12);
			},
		},
	},
	emailAndPassword: {
		enabled: true,
	},
	plugins: [username(), bearer()],
});

export { APIError as BetterAuthAPIError };
