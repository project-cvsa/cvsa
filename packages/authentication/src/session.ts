import { prisma, toInstant, type Session, type User } from "@cvsa/db";
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

	const session = await prisma.orm.auth.Session.create({
		id,
		token,
		userId,
		ipAddress: options?.ipAddress ?? null,
		userAgent: options?.userAgent ?? null,
		expiresAt: toInstant(expiresAt),
	});

	return session;
}

export async function getSessionByToken(token: string): Promise<SessionWithUser | null> {
	const session = await prisma.orm.auth.Session.where({ token }).first();
	if (!session) {
		return null;
	}

	const now = Date.now();
	const expiresEpoch = session.expiresAt.epochMilliseconds;
	if (expiresEpoch <= now) {
		await prisma.orm.auth.Session.where({ token }).delete();
		return null;
	}

	const user = await prisma.orm.auth.User.where({ id: session.userId }).first();
	if (!user) {
		return null;
	}

	const roleName = user.roleId ? await getRoleNameById(user.roleId) : null;
	return { session, user, roleName };
}

export async function deleteSessionByToken(token: string): Promise<void> {
	await prisma.orm.auth.Session.where({ token }).delete();
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
