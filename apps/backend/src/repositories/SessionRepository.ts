import { prisma } from "@lib/prisma";
import type { ISessionRepository, CreateSessionData, SessionWithSecret } from "./interfaces";
import type { Session, Prisma, PrismaClient } from "@project-cvsa/db";
import crypto from "node:crypto";

export class SessionRepository implements ISessionRepository {
	private prisma: PrismaClient;

	constructor(prismaClient: PrismaClient = prisma) {
		this.prisma = prismaClient;
	}

	async create(
		data: CreateSessionData,
		transaction?: Prisma.TransactionClient
	): Promise<SessionWithSecret> {
		const sha256Hasher = new Bun.CryptoHasher("sha256");
		// 120 bits entropy
		const id = crypto.randomBytes(15).toString("hex");
		const secret = crypto.randomBytes(15).toString("hex");
		sha256Hasher.update(secret);
		const secretHash = sha256Hasher.digest("hex");

		const db = transaction ?? this.prisma;
		const session = await db.session.create({
			data: {
				id,
				userId: data.userId,
				secretHash: secretHash,
				userAgent: data.userAgent,
				ipAddress: data.ipAddress,
			},
		});

		// Return session with the plain secret for token generation
		return Object.assign(session, { secret });
	}

	async findById(id: string, transaction?: Prisma.TransactionClient): Promise<Session | null> {
		const db = transaction ?? this.prisma;
		return await db.session.findUnique({
			where: { id },
		});
	}

	async findByIdAndSecretHash(
		id: string,
		secretHash: string,
		transaction?: Prisma.TransactionClient
	): Promise<Session | null> {
		const db = transaction ?? this.prisma;
		return await db.session.findFirst({
			where: {
				id,
				secretHash,
			},
		});
	}
}

// Factory function to create SessionRepository with optional PrismaClient
export function createSessionRepository(prismaClient?: PrismaClient): SessionRepository {
	return new SessionRepository(prismaClient);
}
