import { describe, test, expect, mock, beforeEach } from "bun:test";
import { AuthService } from "@services/AuthService";
import type {
	IUserRepository,
	ISessionRepository,
	SessionWithSecret,
} from "@repositories/interfaces";
import type { User } from "@prisma/generated/client";
import { Prisma } from "@prisma/generated/client";

function hashSecret(secret: string): string {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(secret);
	return hasher.digest("hex");
}

/**
 * AuthService Unit Test
 * * This suite uses strict typing to ensure that our mocks satisfy
 * the IUserRepository and ISessionRepository interfaces without
 * resorting to 'any' type casting.
 */
describe("AuthService Unit Test (Strict Types)", () => {
	let mockUserRepo: IUserRepository;
	let mockSessionRepo: ISessionRepository;
	let authService: AuthService;

	// Standardized mock data matching Prisma generated types
	const mockUser: User = {
		id: "BX23Q95",
		username: "testuser",
		password: "hashed_password",
		displayName: "Test User",
		email: "test@example.com",
		roleId: null,
		reputation: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
	};

	const mockSession: SessionWithSecret = {
		id: "0123456789abcdef0123456789abcd",
		userId: "BX23Q95",
		secretHash: hashSecret("abcdef0123456789abcdef01234567"),
		secret: "abcdef0123456789abcdef01234567",
		userAgent: "Mozilla/5.0",
		ipAddress: "127.0.0.1",
		createdAt: new Date(),
		lastVerifiedAt: new Date(),
	};

	beforeEach(() => {
		// We define the mocks explicitly to satisfy the interface requirements
		mockUserRepo = {
			create: mock(async () => mockUser),
			findById: mock(async (id: string) => (id === mockUser.id ? mockUser : null)),
			findByUsername: mock(async () => null),
			findByEmail: mock(async () => null),
		};

		mockSessionRepo = {
			create: mock(async () => mockSession),
			findById: mock(async (id: string) => (id === mockSession.id ? mockSession : null)),
			findByIdAndSecretHash: mock(async (id: string, secretHash: string) =>
				id === mockSession.id && secretHash === mockSession.secretHash ? mockSession : null
			),
		};

		// Inject the strictly typed mocks into the service
		authService = new AuthService(mockUserRepo, mockSessionRepo);
	});

	describe("register()", () => {
		test("should register user and return token without type assertions", async () => {
			const signupData = {
				username: "testuser",
				password: "securePassword123",
				displayName: "Test User",
			};

			const result = await authService.register(signupData, "127.0.0.1", "Bun-Test");

			// Verify the logic flow matches our architectural requirements
			expect(mockUserRepo.create).toHaveBeenCalled();
			expect(mockSessionRepo.create).toHaveBeenCalled();
			expect(result.token).toBe(`${mockSession.id}.${mockSession.secret}`);
			expect(result.user.id).toBe(mockUser.id);
		});

		test("should execute password verification padding before surfacing duplicate username errors", async () => {
			const duplicateError = new Prisma.PrismaClientKnownRequestError(
				"Unique constraint failed",
				{
					code: "P2002",
					clientVersion: "test",
					meta: {
						driverAdapterError: {
							cause: {
								constraint: {
									fields: ["username"],
								},
							},
						},
					},
				}
			);

			const verifySpy = mock(async () => true);

			mockUserRepo.create = mock(async () => {
				throw duplicateError;
			});
			authService = new AuthService(mockUserRepo, mockSessionRepo, undefined, {
				passwordVerify: verifySpy,
			});

			expect(
				authService.register({
					username: "testuser",
					password: "securePassword123",
				})
			).rejects.toMatchObject({
				code: "USERNAME_DUPLICATED",
			});

			expect(verifySpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("verifyToken()", () => {
		test("should return user for valid token format", async () => {
			const validToken = `${mockSession.id}.${mockSession.secret}`;

			const result = await authService.verifyToken(validToken);

			// Ensure the service correctly hashes the secret and queries repositories
			expect(result).not.toBeNull();
			expect(result?.id).toBe(mockUser.id);
			expect(mockSessionRepo.findById).toHaveBeenCalledWith(mockSession.id);
			expect(mockSessionRepo.findByIdAndSecretHash).not.toHaveBeenCalled();
		});

		test("should return null for malformed tokens after performing padded lookup", async () => {
			const result = await authService.verifyToken("invalid-format");
			expect(result).toBeNull();
			expect(mockSessionRepo.findById).toHaveBeenCalledTimes(1);
		});

		test("should return null if repository finds no session", async () => {
			mockSessionRepo.findById = mock(async () => null);
			authService = new AuthService(mockUserRepo, mockSessionRepo);

			const result = await authService.verifyToken(`${mockSession.id}.${mockSession.secret}`);
			expect(result).toBeNull();
		});

		test("should return null when secret does not match an existing session", async () => {
			const result = await authService.verifyToken(
				`${mockSession.id}.000000000000000000000000000000`
			);
			expect(result).toBeNull();
			expect(mockUserRepo.findById).not.toHaveBeenCalled();
		});
	});
});
