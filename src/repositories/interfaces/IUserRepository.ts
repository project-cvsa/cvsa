import type { User, Prisma } from "@prisma/generated/client";

export interface CreateUserData {
    id: string;
    username: string;
    password: string;
    displayName?: string | null;
    email?: string | null;
}

export interface IUserRepository {
    create(data: CreateUserData, transaction?: Prisma.TransactionClient): Promise<User>;
    findById(id: string, transaction?: Prisma.TransactionClient): Promise<User | null>;
    findByUsername(username: string, transaction?: Prisma.TransactionClient): Promise<User | null>;
    findByEmail(email: string, transaction?: Prisma.TransactionClient): Promise<User | null>;
}
