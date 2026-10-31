import { type User, account, db, user } from "@cvsa/db";
import { and, eq } from "drizzle-orm";
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
		const [existingUser] = await db.select().from(user).limit(1);

		if (existingUser !== undefined && process.env.NODE_ENV !== "test") {
			throw new AppError("error.signup.invite_required", "FORBIDDEN", 403, {
				message: "Registration is invite-only and currently closed.",
			});
		}

		const [sameUsername] = await db
			.select()
			.from(user)
			.where(eq(user.username, data.username))
			.limit(1);
		if (sameUsername) {
			throw new AppError("error.username-taken", "USERNAME_IS_ALREADY_TAKEN", 409);
		}

		if (data.email) {
			const [sameEmail] = await db
				.select()
				.from(user)
				.where(eq(user.email, data.email))
				.limit(1);
			if (sameEmail) {
				throw new AppError(
					"error.email-taken",
					"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
					409
				);
			}
		}

		let roleId: number | null = null;
		if (existingUser === undefined || process.env.NODE_ENV === "test") {
			const ownerRole = await ensureOwnerRole();
			roleId = ownerRole.id;
		}

		const userId = getRandomId(7);
		const [created] = await db
			.insert(user)
			.values({
				id: userId,
				username: data.username,
				displayUsername: data.username,
				name: data.displayName || data.username,
				email: data.email ?? null,
				emailVerified: false,
				reputation: 0,
				roleId,
			})
			.returning();
		if (!created) throw new Error("Failed to create user");

		const hashedPassword = await hashPassword(data.password);
		await db.insert(account).values({
			id: getRandomId(12),
			accountId: userId,
			providerId: "credential",
			userId,
			password: hashedPassword,
		});

		const session = await createSession(userId, options);

		return {
			user: created,
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
		const [byEmail] = await db.select().from(user).where(eq(user.email, data.email)).limit(1);
		const foundUser =
			byEmail ??
			(await db.select().from(user).where(eq(user.username, data.email)).limit(1))[0];

		if (!foundUser) {
			throw new AppError("error.invalid-cred", "INVALID_CREDENTIALS", 401);
		}

		const [credential] = await db
			.select()
			.from(account)
			.where(and(eq(account.userId, foundUser.id), eq(account.providerId, "credential")))
			.limit(1);

		if (!credential?.password) {
			throw new AppError("error.invalid-cred", "INVALID_CREDENTIALS", 401);
		}

		const valid = await verifyPassword(data.password, credential.password);
		if (!valid) {
			throw new AppError("error.invalid-cred", "INVALID_CREDENTIALS", 401);
		}

		const session = await createSession(foundUser.id, options);

		return {
			user: foundUser,
			token: session.token,
		};
	}

	async logout(token: string): Promise<void> {
		await deleteSessionByToken(token);
	}

	async assertCanRegister(_inviteCode?: string | null): Promise<void> {
		const [existingUser] = await db.select().from(user).limit(1);
		if (existingUser !== undefined && process.env.NODE_ENV !== "test") {
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
