import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@common/prisma";

const api = treaty(app);

describe("Registration E2E Tests - POST /v2/user", () => {
	beforeEach(async () => {
		await prisma.session.deleteMany();
		await prisma.user.deleteMany();
	});

	afterAll(async () => {
		await prisma.$disconnect();
		await prisma.session.deleteMany();
		await prisma.user.deleteMany();
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
				displayName: expect.any(String),
				email: payload.email,
				token: expect.any(String),
			},
		});
	});

	test("should fail when nothing is provided", async () => {
		// Create the first user
		// @ts-expect-error it's intended
		const { error, status } = await api.v2.user.post({});

		expect(status).toBe(422);
		expect(error?.value).toMatchObject({
			code: "VALIDATION_ERROR",
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
			code: "USERNAME_IS_ALREADY_TAKEN",
		});
	});

	test("should fail when email already exists", async () => {
		const payload = {
			username: "first_user",
			password: "password123",
			email: "duplicated@example.com",
		};

		// Create the first user
		await api.v2.user.post(payload);

		// Attempt to register with the same username
		const { error, status } = await api.v2.user.post({
			...payload,
			username: "another_user",
		});

		// Should return 409 Conflict
		expect(status).toBe(409);
		expect(error?.value).toMatchObject({
			code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
		});
	});

	test("should fail with invalid email format", async () => {
		const { status, error } = await api.v2.user.post({
			username: "valid_user",
			password: "password123",
			email: "invalid-email-format", // Invalid email
		});

		// Malformed token should be seen as unauthorized
		expect(status).toBe(422);
		expect(error?.value).toMatchObject({
			code: "VALIDATION_ERROR",
		});
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
			email: "first@example.com",
			displayName: "John Doe",
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
			email: "first@example.com",
			displayName: "John Doe",
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
		expect(error?.value).toMatchObject({
			code: "UNAUTHORIZED",
		});
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
});
