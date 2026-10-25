import { prisma, type User } from "@cvsa/db";
import { AppError } from "@cvsa/contracts";
import { getRandomId } from "../randomId";
import { hashPassword, verifyPassword } from "../password";
import { createSession, deleteSessionByToken } from "../session";
import { ensureOwnerRole } from "./roles";
import type { LoginRequestDto, SignupRequestDto } from "./dto";

export class UserService {
	/**
	 * Register a new user:
	 * - If no users exist in the system, automatically creates/assigns the OWNER role.
	 * - If users already exist, registration requires an invite code (placeholder: throws 403 in non-test).
	 * - Checks for duplicate username and email (throws 409 CONFLICT).
	 * - Hashes password using native Argon2id and creates Account record.
	 * - Creates a new database session and returns user and token.
	 */
	async signUp(
		data: SignupRequestDto,
		options?: { ipAddress?: string | null; userAgent?: string | null }
	): Promise<{ user: User; token: string }> {
		const existingUser = await prisma.orm.auth.User.first();

		if (existingUser !== null && process.env.NODE_ENV !== "test") {
			throw new AppError("error.signup.invite_required", "FORBIDDEN", 403, {
				message: "Registration is invite-only and currently closed.",
			});
		}

		// Check username uniqueness
		const sameUsername = await prisma.orm.auth.User.where({
			username: data.username,
		}).first();
		if (sameUsername) {
			throw new AppError("error.username-taken", "USERNAME_IS_ALREADY_TAKEN", 409);
		}

		// Check email uniqueness
		if (data.email) {
			const sameEmail = await prisma.orm.auth.User.where({
				email: data.email,
			}).first();
			if (sameEmail) {
				throw new AppError(
					"error.email-taken",
					"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
					409
				);
			}
		}

		let roleId: number | null = null;
		if (existingUser === null || process.env.NODE_ENV === "test") {
			const ownerRole = await ensureOwnerRole();
			roleId = ownerRole.id;
		}

		const userId = getRandomId(7);
		const user = await prisma.orm.auth.User.create({
			id: userId,
			username: data.username,
			displayUsername: data.username,
			name: data.displayName || data.username,
			email: data.email ?? null,
			emailVerified: false,
			reputation: 0,
			roleId,
		});

		const hashedPassword = await hashPassword(data.password);
		await prisma.orm.auth.Account.create({
			id: getRandomId(12),
			accountId: userId,
			providerId: "credential",
			userId,
			password: hashedPassword,
		});

		const session = await createSession(userId, options);

		return {
			user,
			token: session.token,
		};
	}

	/**
	 * Sign in by username or email and password.
	 */
	async login(
		data: LoginRequestDto,
		options?: { ipAddress?: string | null; userAgent?: string | null }
	): Promise<{ user: User; token: string }> {
		// Try email first, then username
		let user = await prisma.orm.auth.User.where({ email: data.email }).first();
		if (!user) {
			user = await prisma.orm.auth.User.where({ username: data.email }).first();
		}

		if (!user) {
			throw new AppError("error.invalid-cred", "INVALID_CREDENTIALS", 401);
		}

		const account = await prisma.orm.auth.Account.where({
			userId: user.id,
			providerId: "credential",
		}).first();

		if (!account?.password) {
			throw new AppError("error.invalid-cred", "INVALID_CREDENTIALS", 401);
		}

		const valid = await verifyPassword(data.password, account.password);
		if (!valid) {
			throw new AppError("error.invalid-cred", "INVALID_CREDENTIALS", 401);
		}

		const session = await createSession(user.id, options);

		return {
			user,
			token: session.token,
		};
	}

	async logout(token: string): Promise<void> {
		await deleteSessionByToken(token);
	}

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
export const authService = userService;
