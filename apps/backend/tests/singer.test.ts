import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@cvsa/db";

const api = treaty(app);

describe("Singer E2E Tests", () => {
	async function getAuthToken() {
		const signup = await api.v2.user.post({
			username: `${Math.random()}`,
			password: "password123",
		});
		return signup.data?.data.token;
	}

	describe("GET /v2/singer/:id - Get Singer", () => {
		test("should retrieve a singer", async () => {
			const singer = await prisma.singer.create({
				data: {
					name: "Test Singer",
					description: "Test Description",
					language: "zh",
				},
			});

			const { data, status } = await api.v2.singer({ id: singer.id }).get();

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Test Singer",
				description: "Test Description",
				language: "zh",
			});
		});

		test("should return 404 for nonexistent singer", async () => {
			const { error, status } = await api.v2.singer({ id: 99999 }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});

		test("should not retrieve soft-deleted singer", async () => {
			const singer = await prisma.singer.create({
				data: {
					name: "Deleted Singer",
					deletedAt: new Date(),
				},
			});

			const { error, status } = await api.v2.singer({ id: singer.id }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("POST /v2/singer - Create Singer", () => {
		test("should create a singer with authentication", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "New Singer",
				description: "A virtual singer",
				language: "zh",
			};

			const { data, status } = await api.v2.singer.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "New Singer",
				description: "A virtual singer",
				language: "zh",
			});
		});

		test("should return 401 without authentication", async () => {
			const payload = {
				name: "Test Singer",
			};

			const { error, status } = await api.v2.singer.post(payload);

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should create a singer with localized names and descriptions", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "Singer Name",
				localizedNames: {
					zh: "歌手名称",
					ja: "シンガー名",
				},
				description: "Description in English",
				localizedDescriptions: {
					zh: "中文描述",
					ja: "日本語の説明",
				},
				language: "zh",
			};

			const { data, status } = await api.v2.singer.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Singer Name",
				localizedNames: {
					zh: "歌手名称",
					ja: "シンガー名",
				},
				localizedDescriptions: {
					zh: "中文描述",
					ja: "日本語の説明",
				},
			});
		});

		test("should create a singer with minimal fields", async () => {
			const token = await getAuthToken();

			const { data, status } = await api.v2.singer.post(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
			});
		});
	});

	describe("PATCH /v2/singer/:id - Update Singer", () => {
		test("should update a singer with authentication", async () => {
			const token = await getAuthToken();

			const singer = await prisma.singer.create({
				data: {
					name: "Original Name",
					description: "Original Description",
					language: "zh",
				},
			});

			const { data, status } = await api.v2.singer({ id: singer.id }).patch(
				{ name: "Updated Name", description: "Updated Description", language: "en" },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(200);
			expect(data?.name).toBe("Updated Name");
			expect(data?.description).toBe("Updated Description");
			expect(data?.language).toBe("en");
		});

		test("should return 401 without authentication", async () => {
			const singer = await prisma.singer.create({
				data: {
					name: "Test Singer",
				},
			});

			const { status } = await api.v2.singer({ id: singer.id }).patch({
				name: "Updated Name",
			});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent singer", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2.singer({ id: 999999 }).patch(
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

		test("should update localized names", async () => {
			const token = await getAuthToken();

			const singer = await prisma.singer.create({
				data: {
					name: "Singer",
					localizedNames: { zh: "旧名" },
				},
			});

			const { data, status } = await api.v2.singer({ id: singer.id }).patch(
				{ localizedNames: { zh: "新名", ja: "新しい名前" } },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(200);
			expect(data?.localizedNames).toEqual({ zh: "新名", ja: "新しい名前" });
		});
	});

	describe("DELETE /v2/singer/:id - Delete Singer", () => {
		test("should soft delete a singer with authentication", async () => {
			const token = await getAuthToken();

			const singer = await prisma.singer.create({
				data: {
					name: "Singer to Delete",
				},
			});

			const { status } = await api.v2.singer({ id: singer.id }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(204);

			const deletedSinger = await prisma.singer.findUnique({
				where: { id: singer.id },
			});
			expect(deletedSinger?.deletedAt).not.toBeNull();
		});

		test("should return 401 without authentication", async () => {
			const singer = await prisma.singer.create({
				data: {
					name: "Test Singer",
				},
			});

			const { status } = await api.v2.singer({ id: singer.id }).delete({}, {});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent singer", async () => {
			const token = await getAuthToken();

			const { status } = await api.v2.singer({ id: 999999 }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(404);
		});

		test("should return 404 when trying to delete already deleted singer", async () => {
			const token = await getAuthToken();

			const singer = await prisma.singer.create({
				data: {
					name: "Already Deleted",
					deletedAt: new Date(),
				},
			});

			const { error, status } = await api.v2.singer({ id: singer.id }).delete(
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
