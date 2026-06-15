import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@cvsa/db";

const api = treaty(app);

describe("Artist Role E2E Tests", () => {
	async function getAuthToken() {
		const signup = await api.v2.user.post({
			username: `${Math.random()}`,
			password: "password123",
		});
		return signup.data?.data.token;
	}

	describe("GET /v2/artist-role/:id - Get Artist Role Details", () => {
		test("should retrieve an artist role", async () => {
			const role = await prisma.artistRole.create({
				data: {
					name: "Producer",
					localizedNames: { zh: "制作人", en: "Producer" },
				},
			});

			const { data, status } = await api.v2["artist-role"]({ id: role.id }).get();

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Producer",
				localizedNames: { zh: "制作人", en: "Producer" },
			});
		});

		test("should return 404 for nonexistent role", async () => {
			const { error, status } = await api.v2["artist-role"]({ id: 99999 }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});

		test("should not retrieve soft-deleted role", async () => {
			const role = await prisma.artistRole.create({
				data: {
					name: "Deleted Role",
					deletedAt: new Date(),
				},
			});

			const { error, status } = await api.v2["artist-role"]({ id: role.id }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("POST /v2/artist-role - Create Artist Role", () => {
		test("should create a role with authentication", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "Composer",
				localizedNames: { zh: "作曲人", ja: "作曲家" },
			};

			const { data, status } = await api.v2["artist-role"].post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Composer",
				localizedNames: { zh: "作曲人", ja: "作曲家" },
			});
		});

		test("should return 401 without authentication", async () => {
			const payload = {
				name: "Test Role",
			};

			const { error, status } = await api.v2["artist-role"].post(payload);

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should create a role with minimal fields", async () => {
			const token = await getAuthToken();

			const { data, status } = await api.v2["artist-role"].post(
				{ name: "Illustrator" },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Illustrator",
			});
		});
	});

	describe("PATCH /v2/artist-role/:id - Update Artist Role", () => {
		test("should update a role with authentication", async () => {
			const token = await getAuthToken();

			const role = await prisma.artistRole.create({
				data: {
					name: "Original Name",
				},
			});

			const { data, status } = await api.v2["artist-role"]({ id: role.id }).patch(
				{
					name: "Updated Name",
					localizedNames: { zh: "更新名称" },
				},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(200);
			expect(data?.name).toBe("Updated Name");
			expect(data?.localizedNames).toEqual({ zh: "更新名称" });
		});

		test("should return 401 without authentication", async () => {
			const role = await prisma.artistRole.create({
				data: {
					name: "Test Role",
				},
			});

			const { status } = await api.v2["artist-role"]({ id: role.id }).patch({
				name: "Updated Name",
			});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent role", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2["artist-role"]({ id: 999999 }).patch(
				{ name: "Updated Name" },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("DELETE /v2/artist-role/:id - Delete Artist Role", () => {
		test("should soft delete a role with authentication", async () => {
			const token = await getAuthToken();

			const role = await prisma.artistRole.create({
				data: {
					name: "Role to Delete",
				},
			});

			const { status } = await api.v2["artist-role"]({ id: role.id }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(204);

			const deletedRole = await prisma.artistRole.findUnique({
				where: { id: role.id },
			});
			expect(deletedRole?.deletedAt).not.toBeNull();
		});

		test("should return 401 without authentication", async () => {
			const role = await prisma.artistRole.create({
				data: {
					name: "Test Role",
				},
			});

			const { status } = await api.v2["artist-role"]({ id: role.id }).delete({}, {});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent role", async () => {
			const token = await getAuthToken();

			const { status } = await api.v2["artist-role"]({ id: 999999 }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(404);
		});

		test("should return 404 when trying to delete already deleted role", async () => {
			const token = await getAuthToken();

			const role = await prisma.artistRole.create({
				data: {
					name: "Already Deleted",
					deletedAt: new Date(),
				},
			});

			const { error, status } = await api.v2["artist-role"]({ id: role.id }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});
});
