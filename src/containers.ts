import { prisma } from "@lib/prisma";
import { createUserRepository } from "@repositories/UserRepository";
import { createSessionRepository } from "@repositories/SessionRepository";
import { createAuthService } from "@services/AuthService";

const userRepo = createUserRepository(prisma);
const sessionRepo = createSessionRepository(prisma);

export const authService = createAuthService(userRepo, sessionRepo, prisma);
