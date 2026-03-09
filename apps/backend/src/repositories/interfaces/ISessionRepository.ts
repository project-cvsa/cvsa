import type { Session, Prisma } from "@project-cvsa/db";

export interface CreateSessionData {
	userId: string;
	ipAddress?: string;
	userAgent?: string;
}

// Session with secret for token generation
export type SessionWithSecret = Session & { secret: string };

export interface ISessionRepository {
	create(
		data: CreateSessionData,
		transaction?: Prisma.TransactionClient
	): Promise<SessionWithSecret>;
	findById(id: string, transaction?: Prisma.TransactionClient): Promise<Session | null>;
	findByIdAndSecretHash(
		id: string,
		secretHash: string,
		transaction?: Prisma.TransactionClient
	): Promise<Session | null>;
}
