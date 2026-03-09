import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { createUserRepository } from "@repositories/UserRepository";
import { prisma } from "@lib/prisma";
import { Prisma } from "@prisma/generated/client";

/**
 * UserRepository Integration Test
 * Verifies database interaction for persistence-only repository behavior.
 */
describe("UserRepository Integration Test", () => {
	const repo = createUserRepository(prisma);

	// Clean up the user table before each test to ensure a predictable state
	beforeEach(async () => {
		await prisma.user.deleteMany();
	});

	// Close database connection after all tests are finished
	afterAll(async () => {
		await prisma.$disconnect();
	});

	test("should persist a new user to the database", async () => {
		const userData = {
			id: "INTEG01",
			username: "integration_tester",
			password: "hashed_password",
			displayName: "Integration Bot",
			email: "bot@example.com",
		};

		const user = await repo.create(userData);

		// Verify returned object properties
		expect(user.id).toBe(userData.id);
		expect(user.username).toBe(userData.username);
		expect(user.password).toBe(userData.password);

		// Verify database record actually exists
		const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
		expect(dbUser).not.toBeNull();
		expect(dbUser?.username).toBe(userData.username);
		expect(dbUser?.password).toBe(userData.password);
	});

	test("should throw Prisma P2002 when username is duplicated", async () => {
		const userData = {
			username: "duplicate_user",
			password: "hashed_password",
		};

		// Create the first user
		await repo.create({ ...userData, id: "DUPUSR1" });

		// Repository now only persists data and leaves business error mapping to service
		try {
			await repo.create({ ...userData, id: "DUPUSR2" });
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
			const err = e as Prisma.PrismaClientKnownRequestError;
			expect(err.code).toBe("P2002");
		}
	});

	test("should find a user by email correctly", async () => {
		const email = "search@example.com";
		await repo.create({
			id: "SEARCH1",
			username: "searcher",
			password: "hashed_password",
			email,
		});

		const foundUser = await repo.findByEmail(email);
		expect(foundUser).not.toBeNull();
		expect(foundUser?.email).toBe(email);
	});

	test("should find a user by username correctly", async () => {
		const username = "searcher";
		await repo.create({
			id: "SEARCH2",
			username,
			password: "hashed_password",
			email: "search@example.com",
		});

		const foundUser = await repo.findByUsername(username);
		expect(foundUser).not.toBeNull();
		expect(foundUser?.username).toBe(username);
	});

	test("should return null when searching for non-existent user", async () => {
		const user = await repo.findById("NON_EXISTENT_ID");
		expect(user).toBeNull();
	});
});
