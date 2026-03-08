import type { User } from "@prisma/generated/client";

export interface CreateUserData {
    username: string;
    password: string;
    displayName?: string | null;
    email?: string | null;
}

export interface AuthResult {
    user: User;
    token: string;
}

export interface IAuthService {
    register(data: CreateUserData, ipAddress?: string, userAgent?: string): Promise<AuthResult>;
    verifyToken(token: string): Promise<User | null>;
}
