import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { createSessionRepository } from "@repositories/SessionRepository";
import { createUserRepository } from "@repositories/UserRepository";
import { prisma } from "@lib/prisma";

/**
 * SessionRepository Integration Test
 * Validates session lifecycle, SHA-256 hashing, and relational integrity.
 */
describe("SessionRepository Integration Test", () => {
	const sessionRepo = createSessionRepository(prisma);
	const userRepo = createUserRepository(prisma);

	// Clean up database to ensure isolation
	beforeEach(async () => {
		await prisma.session.deleteMany();
		await prisma.user.deleteMany();
	});

	afterAll(async () => {
		await prisma.$disconnect();
	});

	test("should create a session with a hashed secret and return the plain secret", async () => {
		// 1. Setup: A session requires a valid User ID due to FK constraints
		const user = await userRepo.create({
			id: "SESSU01",
			username: "session_user",
			password: "password123",
		});

		const sessionData = {
			userId: user.id,
			ipAddress: "192.168.1.1",
			userAgent: "Bun-Runtime",
		};

		// 2. Execution
		const session = await sessionRepo.create(sessionData);

		// 3. Assertions
		expect(session.id).toBeDefined();
		expect(session.userId).toBe(user.id);

		// Ensure the 'secret' is returned plain (for token generation)
		// but the 'secretHash' is what actually lives in the DB
		expect(session.secret).toBeDefined();
		expect(session.secret).toHaveLength(30); // 15 bytes hex = 30 chars
		expect(session.secretHash).not.toBe(session.secret);

		// Verify DB persistence
		const dbSession = await prisma.session.findUnique({
			where: { id: session.id },
		});
		expect(dbSession).not.toBeNull();
		expect(dbSession?.secretHash).toBe(session.secretHash);
	});

	test("should find a session by ID and matching secret hash", async () => {
		const user = await userRepo.create({
			id: "AUTHU01",
			username: "auth_user",
			password: "pwd",
		});
		const session = await sessionRepo.create({ userId: user.id });

		// Attempt to find using the correct hash generated during creation
		const found = await sessionRepo.findByIdAndSecretHash(session.id, session.secretHash);

		expect(found).not.toBeNull();
		expect(found?.id).toBe(session.id);
	});

	test("should return null if the secret hash does not match", async () => {
		const user = await userRepo.create({
			id: "SECU01A",
			username: "secure_user",
			password: "pwd",
		});
		const session = await sessionRepo.create({ userId: user.id });

		// Attempt to find using an incorrect hash
		const found = await sessionRepo.findByIdAndSecretHash(session.id, "wrong_hash");

		expect(found).toBeNull();
	});

	test("should maintain referential integrity (Foreign Key)", async () => {
		// Attempting to create a session for a non-existent user should fail at DB level
		expect(sessionRepo.create({ userId: "NON_EXISTENT_USER" })).rejects.toThrow();
	});
});
