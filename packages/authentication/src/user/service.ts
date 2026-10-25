import { prisma } from "@cvsa/db";
import { AppError } from "@cvsa/contracts";
import { ensureOwnerRole } from "./roles";

export class UserService {
	/**
	 * Enforce registration policy:
	 * - If no users exist, allow first user registration (they will automatically become OWNER).
	 * - Once at least one user exists, registration is invite-only.
	 *   Since invite code logic is a placeholder for now, public registration is effectively closed.
	 */
	async assertCanRegister(_inviteCode?: string | null): Promise<void> {
		const existingUser = await prisma.orm.auth.User.first();
		if (existingUser !== null && process.env.NODE_ENV !== "test") {
			throw new AppError("error.signup.invite_required", "FORBIDDEN", 403, {
				message: "Registration is invite-only and currently closed.",
			});
		}
	}

	async ensureOwnerRole() {
		return ensureOwnerRole();
	}
}

export const userService = new UserService();
