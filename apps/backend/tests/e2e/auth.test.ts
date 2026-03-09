import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@lib/prisma";

const api = treaty(app);

describe("Registration E2E Tests - POST /v2/user", () => {
	beforeEach(async () => {
		await prisma.session.deleteMany();
		await prisma.user.deleteMany();
	});

	afterAll(async () => {
		await prisma.$disconnect();
	});

	test("should register a new user", async () => {
		const payload = {
			username: "new_user",
			password: "password123",
			email: "first@example.com",
		};

		const { data, status } = await api.v2.user.post(payload);

		expect(status).toBe(200);
		expect(data).toMatchObject({
			message: expect.any(String),
			data: {
				id: expect.any(String),
				username: payload.username,
				displayName: null,
				email: payload.email,
				token: expect.any(String),
			},
		});
	});

	test("should fail when username already exists", async () => {
		const payload = {
			username: "duplicate_user",
			password: "password123",
			email: "first@example.com",
		};

		// Create the first user
		await api.v2.user.post(payload);

		// Attempt to register with the same username
		const { error, status } = await api.v2.user.post({
			...payload,
			email: "second@example.com",
		});

		// Should return 409 Conflict
		expect(status).toBe(409);
		expect(error?.value).toMatchObject({
			code: "USERNAME_DUPLICATED",
		});
	});

	test("should fail with invalid email format", async () => {
		const { status, error } = await api.v2.user.post({
			username: "valid_user",
			password: "password123",
			email: "invalid-email-format", // Invalid email
		});

		// Should be caught by Zod validation in SignupRequestSchema
		expect(status).toBe(422);
		// @ts-expect-error tracked in elysiajs/elysia#1248 (error type inference still broken for custom onError)
		expect(error?.value?.code).toBe("VALIDATION_ERROR");
	});
});

describe("Profile E2E Tests - GET /v2/me", () => {
	beforeEach(async () => {
		await prisma.session.deleteMany();
		await prisma.user.deleteMany();
	});

	afterAll(async () => {
		await prisma.$disconnect();
	});
	test("should return user profile with valid token", async () => {
		// 1. Register to get a token
		const signup = await api.v2.user.post({
			username: "profile_user",
			password: "password123",
		});

		const token = signup.data?.data.token;
		expect(token).toBeDefined();

		// 2. Fetch profile using the token in Authorization header
		const { data, status } = await api.v2.me.get({
			headers: {
				authorization: `Bearer ${token}`,
			},
		});

		expect(status).toBe(200);
		expect(data).toMatchObject({
			username: "profile_user",
		});
		expect(data?.id).toBeString();
	});

	test("should return 401 for malformed token", async () => {
		const { status, error } = await api.v2.me.get({
			headers: {
				authorization: "Bearer invalid.token.format",
			},
		});

		// Malformed token should be seen as unauthorized
		expect(status).toBe(401);
		// @ts-expect-error – tracked in elysiajs/elysia#1248 (error type inference still broken for custom onError)
		expect(error?.value.code).toBe("UNAUTHORIZED");
	});

	test("should return 401 for non-existent session", async () => {
		// Manually craft a token that looks valid but doesn't exist in DB
		// Format: hex(30).hex(30)
		const fakeToken = "0123456789abcdef0123456789abcd.0123456789abcdef0123456789abcd";

		const { status } = await api.v2.me.get({
			headers: {
				authorization: `Bearer ${fakeToken}`,
			},
		});

		expect(status).toBe(401);
	});

	test("should return 401 when Authorization header is missing", async () => {
		const { status } = await api.v2.me.get();

		expect(status).toBe(401);
	});

	test("should reject a validly-shaped token with the wrong secret", async () => {
		const signup = await api.v2.user.post({
			username: "wrong_secret_user",
			password: "password123",
		});

		const token = signup.data?.data.token;
		expect(token).toBeDefined();
		if (!token) {
			throw new Error("Expected signup to return a token");
		}

		const [sessionId] = token.split(".");
		const wrongSecretToken = `${sessionId}.000000000000000000000000000000`;

		const { status, error } = await api.v2.me.get({
			headers: {
				authorization: `Bearer ${wrongSecretToken}`,
			},
		});

		expect(status).toBe(401);
		// @ts-expect-error – tracked in elysiajs/elysia#1248 (error type inference still broken for custom onError)
		expect(error?.value.code).toBe("UNAUTHORIZED");
	});
});
