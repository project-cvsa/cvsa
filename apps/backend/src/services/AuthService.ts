import type { IAuthService, CreateUserData, AuthResult } from "./interfaces";
import type { IUserRepository } from "@repositories/interfaces/IUserRepository";
import type { ISessionRepository } from "@repositories/interfaces/ISessionRepository";
import { prisma } from "@lib/prisma";
import { AppError } from "@lib/error";
import { ConflictError } from "@lib/error/conflict";
import { Prisma, type User, type PrismaClient } from "@project-cvsa/db";
import { customAlphabet } from "nanoid";
import crypto from "node:crypto";

const MAX_RETRIES = 5;
const alphabet = "123456789ACDEFGHJKLMNPQRSTUVWXYZ";
const nanoid = customAlphabet(alphabet, 7);
const PASSWORD_HASH_COST = 4;
const SESSION_SECRET_HASH_ALGORITHM = "sha256";
const DUMMY_SESSION_SECRET = "0".repeat(30);
const DUMMY_PASSWORD_HASH = await Bun.password.hash(DUMMY_SESSION_SECRET, {
	algorithm: "argon2id",
	memoryCost: PASSWORD_HASH_COST,
});

function hashSessionSecret(secret: string): string {
	const sha256Hasher = new Bun.CryptoHasher(SESSION_SECRET_HASH_ALGORITHM);
	sha256Hasher.update(secret);
	return sha256Hasher.digest("hex");
}

function fixedLengthEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

interface AuthServiceOptions {
	passwordVerify?: typeof Bun.password.verify;
}

export class AuthService implements IAuthService {
	private userRepository: IUserRepository;
	private sessionRepository: ISessionRepository;
	private prisma: PrismaClient;
	private passwordVerify: typeof Bun.password.verify;

	constructor(
		userRepo: IUserRepository,
		sessionRepo: ISessionRepository,
		prismaClient: PrismaClient = prisma,
		options: AuthServiceOptions = {}
	) {
		this.userRepository = userRepo;
		this.sessionRepository = sessionRepo;
		this.prisma = prismaClient;
		this.passwordVerify = options.passwordVerify ?? Bun.password.verify;
	}

	async register(
		data: CreateUserData,
		ipAddress?: string,
		userAgent?: string
	): Promise<AuthResult> {
		return await this.prisma.$transaction(async (tx) => {
			const hashedPassword = await Bun.password.hash(data.password, {
				algorithm: "argon2id",
				memoryCost: PASSWORD_HASH_COST,
			});

			let attempts = 0;
			let user: User | null = null;

			while (attempts < MAX_RETRIES) {
				try {
					user = await this.userRepository.create(
						{
							id: nanoid(),
							username: data.username,
							password: hashedPassword,
							displayName: data.displayName,
							email: data.email,
						},
						tx
					);
					break;
				} catch (e) {
					if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
						// Normalize duplicate failures to execute the same expensive work
						// before surfacing whether the username/email already exists.
						await this.passwordVerify(data.password, DUMMY_PASSWORD_HASH);

						// TODO: Prisma driver adapter P2002 workaround
						// remove after prisma/prisma#28281 is fixed
						// meta.target missing -> using undocumented driverAdapterError shape
						const adapterError = e.meta?.driverAdapterError as
							| { cause?: { constraint?: { fields?: string[] } } }
							| undefined;
						const fields = adapterError?.cause?.constraint?.fields;

						if (fields?.includes("username")) {
							throw new ConflictError(
								"username",
								"USERNAME_DUPLICATED",
								"User name duplicated"
							);
						}
						if (fields?.includes("email")) {
							throw new ConflictError(
								"email",
								"EMAIL_DUPLICATED",
								"This email has been registered"
							);
						}
						if (fields?.includes("id")) {
							attempts++;
							continue;
						}
					}

					throw e;
				}
			}

			if (!user) {
				throw new AppError("Failed to register", "ID_GENERATION_FAILED");
			}

			const session = await this.sessionRepository.create(
				{
					userId: user.id,
					ipAddress,
					userAgent,
				},
				tx
			);
			const token = `${session.id}.${session.secret}`;
			return {
				user,
				token,
			};
		});
	}

	async verifyToken(token: string): Promise<User | null> {
		const [id, secret, ...rest] = token.split(".");
		const hasValidShape = Boolean(id && secret) && rest.length === 0;
		const sessionId = id ?? DUMMY_SESSION_SECRET;
		const sessionSecret = secret ?? DUMMY_SESSION_SECRET;
		const secretHash = hashSessionSecret(sessionSecret);

		const session = await this.sessionRepository.findById(sessionId);
		const storedSecretHash = session?.secretHash ?? hashSessionSecret(DUMMY_SESSION_SECRET);
		const hashesMatch = fixedLengthEqual(secretHash, storedSecretHash);

		if (!hasValidShape || !session || !hashesMatch) {
			return null;
		}

		const user = await this.userRepository.findById(session.userId);
		return user;
	}
}

// Factory function to create AuthService
export function createAuthService(
	userRepo: IUserRepository,
	sessionRepo: ISessionRepository,
	prismaClient?: PrismaClient
): AuthService {
	return new AuthService(userRepo, sessionRepo, prismaClient);
}
