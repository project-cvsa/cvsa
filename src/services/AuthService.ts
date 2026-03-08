import type { IAuthService, CreateUserData, AuthResult } from "./interfaces";
import { userRepository, sessionRepository } from "@repositories/index";
import type { User } from "@prisma/generated/client";

export class AuthService implements IAuthService {
    async register(data: CreateUserData, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
        const user = await userRepository.create(data);
        const session = await sessionRepository.create({
            userId: user.id,
            ipAddress,
            userAgent,
        });
        const token = `${session.id}.${session.secret}`;
        return {
            user,
            token,
        };
    }

    async verifyToken(token: string): Promise<User | null> {
        const [id, secret] = token.split(".");
        if (!id || !secret) {
            return null;
        }

        const sha256Hasher = new Bun.CryptoHasher("sha256");
        sha256Hasher.update(secret);
        const secretHash = sha256Hasher.digest("hex");

        const session = await sessionRepository.findByIdAndSecretHash(id, secretHash);
        if (!session) {
            return null;
        }

        const user = await userRepository.findById(session.userId);
        return user;
    }
}

// Singleton instance
export const authService = new AuthService();
