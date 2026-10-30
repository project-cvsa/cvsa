import { type Session, type User, db, session, toInstant, user } from "@cvsa/db";
import { eq } from "drizzle-orm";
import { getRandomId } from "./randomId";
import { generateSessionToken } from "./token";
import { parseTokenFromHeaders, SESSION_MAX_AGE_SECONDS } from "./cookies";
import { getRoleNameById } from "./user/roles";

export interface SessionWithUser {
	session: Session;
	user: User;
	roleName: string | null;
}

export async function createSession(
	userId: string,
	options?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<Session> {
	const id = getRandomId(12);
	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

	const [created] = await db
		.insert(session)
		.values({
			id,
			token,
			userId,
			ipAddress: options?.ipAddress ?? null,
			userAgent: options?.userAgent ?? null,
			expiresAt: toInstant(expiresAt),
		})
		.returning();
	if (!created) throw new Error("Failed to create session");
	return created;
}

export async function getSessionByToken(token: string): Promise<SessionWithUser | null> {
	const [found] = await db.select().from(session).where(eq(session.token, token)).limit(1);
	if (!found) {
		return null;
	}

	const now = Date.now();
	const expiresEpoch = found.expiresAt.epochMilliseconds;
	if (expiresEpoch <= now) {
		await db.delete(session).where(eq(session.token, token));
		return null;
	}

	const [foundUser] = await db.select().from(user).where(eq(user.id, found.userId)).limit(1);
	if (!foundUser) {
		return null;
	}

	const roleName = foundUser.roleId ? await getRoleNameById(foundUser.roleId) : null;
	return { session: found, user: foundUser, roleName };
}

export async function deleteSessionByToken(token: string): Promise<void> {
	await db.delete(session).where(eq(session.token, token));
}

export async function resolveAuthFromHeaders(
	headers: Headers | Record<string, string | undefined>
): Promise<SessionWithUser | null> {
	const token = parseTokenFromHeaders(headers);
	if (!token) {
		return null;
	}
	return getSessionByToken(token);
}
