import { prisma } from "@lib/prisma";
import type { IUserRepository, CreateUserData } from "./interfaces";
import type { User } from "@project-cvsa/db";
import type { Prisma, PrismaClient } from "@project-cvsa/db";

export class UserRepository implements IUserRepository {
	private prisma: PrismaClient;

	constructor(prismaClient: PrismaClient = prisma) {
		this.prisma = prismaClient;
	}

	async create(data: CreateUserData, transaction?: Prisma.TransactionClient): Promise<User> {
		const db = transaction ?? this.prisma;
		return await db.user.create({
			data: {
				id: data.id,
				username: data.username,
				password: data.password,
				displayName: data.displayName,
				email: data.email,
			},
		});
	}

	async findById(id: string, transaction?: Prisma.TransactionClient): Promise<User | null> {
		const db = transaction ?? this.prisma;
		return await db.user.findUnique({
			where: { id },
		});
	}

	async findByUsername(
		username: string,
		transaction?: Prisma.TransactionClient
	): Promise<User | null> {
		const db = transaction ?? this.prisma;
		return await db.user.findUnique({
			where: { username },
		});
	}

	async findByEmail(email: string, transaction?: Prisma.TransactionClient): Promise<User | null> {
		const db = transaction ?? this.prisma;
		return await db.user.findUnique({
			where: { email },
		});
	}
}

// Factory function to create UserRepository with optional PrismaClient
export function createUserRepository(prismaClient?: PrismaClient): UserRepository {
	return new UserRepository(prismaClient);
}
