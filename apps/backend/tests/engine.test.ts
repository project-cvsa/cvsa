import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@cvsa/db";

const api = treaty(app);

describe("Engine E2E Tests", () => {
	async function getAuthToken() {
		const signup = await api.v2.user.post({
			username: `${Math.random()}`,
			password: "password123",
		});
		return signup.data?.data.token;
	}

	describe("GET /v2/engine/:id/details - Get Engine Details", () => {
		test("should retrieve an engine", async () => {
			const engine = await prisma.svsEngine.create({
				data: {
					name: "Test Engine",
					description: "Test Description",
				},
			});

			const { data, status } = await api.v2.engine({ id: engine.id }).details.get();

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Test Engine",
				description: "Test Description",
			});
		});

		test("should return 404 for nonexistent engine", async () => {
			const { error, status } = await api.v2.engine({ id: 99999 }).details.get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("POST /v2/engine - Create Engine", () => {
		test("should create an engine with authentication", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "VOCALOID",
				description: "A singing voice synthesis software",
			};

			const { data, status } = await api.v2.engine.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "VOCALOID",
				description: "A singing voice synthesis software",
			});
		});

		test("should return 401 without authentication", async () => {
			const payload = {
				name: "Test Engine",
			};

			const { error, status } = await api.v2.engine.post(payload);

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should create an engine with localized descriptions", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "Synthesizer V",
				description: "A singing voice synthesis software",
				localizedDescriptions: {
					zh: "歌声合成软件",
					ja: "歌声合成ソフトウェア",
				},
			};

			const { data, status } = await api.v2.engine.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Synthesizer V",
				localizedDescriptions: {
					zh: "歌声合成软件",
					ja: "歌声合成ソフトウェア",
				},
			});
		});
	});

	describe("PATCH /v2/engine/:id - Update Engine", () => {
		test("should update an engine with authentication", async () => {
			const token = await getAuthToken();

			const engine = await prisma.svsEngine.create({
				data: {
					name: "Original Name",
					description: "Original Description",
				},
			});

			const { data, status } = await api.v2.engine({ id: engine.id }).patch(
				{ name: "Updated Name", description: "Updated Description" },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(200);
			expect(data?.name).toBe("Updated Name");
			expect(data?.description).toBe("Updated Description");
		});

		test("should return 401 without authentication", async () => {
			const engine = await prisma.svsEngine.create({
				data: {
					name: "Test Engine",
				},
			});

			const { status } = await api.v2.engine({ id: engine.id }).patch({
				name: "Updated Name",
			});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent engine", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2.engine({ id: 999999 }).patch(
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

	describe("DELETE /v2/engine/:id - Delete Engine", () => {
		test("should soft delete an engine with authentication", async () => {
			const token = await getAuthToken();

			const engine = await prisma.svsEngine.create({
				data: {
					name: "Engine to Delete",
				},
			});

			const { status } = await api.v2.engine({ id: engine.id }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(204);

			const deletedEngine = await prisma.svsEngine.findUnique({
				where: { id: engine.id },
			});
			expect(deletedEngine?.deletedAt).not.toBeNull();
		});

		test("should return 401 without authentication", async () => {
			const engine = await prisma.svsEngine.create({
				data: {
					name: "Test Engine",
				},
			});

			const { status } = await api.v2.engine({ id: engine.id }).delete({}, {});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent engine", async () => {
			const token = await getAuthToken();

			const { status } = await api.v2.engine({ id: 999999 }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(404);
		});
	});
});
