import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "../src/index";
import { artist as artistTable, db, Temporal } from "@cvsa/db";
import { eq } from "drizzle-orm";

const api = treaty(app);

describe("Artist E2E Tests", () => {
	async function getAuthToken() {
		const signup = await api.v2.user.post({
			username: `${Math.random()}`,
			password: "password123",
		});
		return signup.data?.data.token;
	}

	describe("GET /v2/artist/:id - Get Artist Details", () => {
		test("should retrieve an artist", async () => {
			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Test Artist",
					description: "Test Description",
					language: "zh",
					aliases: ["Alias1", "Alias2"],
				})
				.returning();

			const { data, status } = await api.v2.artist({ id: artist.id }).get();

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Test Artist",
				description: "Test Description",
				language: "zh",
				aliases: ["Alias1", "Alias2"],
			});
		});

		test("should return 404 for nonexistent artist", async () => {
			const { error, status } = await api.v2.artist({ id: 2_000_000_000 }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});

		test("should not retrieve soft-deleted artist", async () => {
			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Deleted Artist",
					aliases: [],
					deletedAt: Temporal.Now.instant(),
				})
				.returning();

			const { error, status } = await api.v2.artist({ id: artist.id }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("POST /v2/artist - Create Artist", () => {
		test("should create an artist with authentication", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "New Artist",
				description: "A talented producer",
				language: "zh",
				aliases: ["Producer X", "PX"],
			};

			const { data, status } = await api.v2.artist.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "New Artist",
				description: "A talented producer",
				language: "zh",
				aliases: ["Producer X", "PX"],
			});
		});

		test("should return 401 without authentication", async () => {
			const payload = {
				name: "Test Artist",
			};

			const { error, status } = await api.v2.artist.post(payload);

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should create an artist with localized names and descriptions", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "Artist Name",
				localizedNames: {
					zh: "艺术家名称",
					ja: "アーティスト名",
				},
				description: "Description in English",
				localizedDescriptions: {
					zh: "中文描述",
					ja: "日本語の説明",
				},
				language: "zh",
			};

			const { data, status } = await api.v2.artist.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Artist Name",
				localizedNames: {
					zh: "艺术家名称",
					ja: "アーティスト名",
				},
				localizedDescriptions: {
					zh: "中文描述",
					ja: "日本語の説明",
				},
			});
		});

		test("should create an artist with minimal fields", async () => {
			const token = await getAuthToken();

			const { data, status } = await api.v2.artist.post(
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

	describe("PATCH /v2/artist/:id - Update Artist", () => {
		test("should update an artist with authentication", async () => {
			const token = await getAuthToken();

			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Original Name",
					description: "Original Description",
					language: "zh",
					aliases: [],
				})
				.returning();

			const { data, status } = await api.v2.artist({ id: artist.id }).patch(
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
			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Test Artist",
					aliases: [],
				})
				.returning();

			const { status } = await api.v2.artist({ id: artist.id }).patch({
				name: "Updated Name",
			});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent artist", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2.artist({ id: 2_000_000_000 }).patch(
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

		test("should update aliases array", async () => {
			const token = await getAuthToken();

			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Artist",
					aliases: ["Old Alias"],
				})
				.returning();

			const { data, status } = await api.v2.artist({ id: artist.id }).patch(
				{ aliases: ["New Alias 1", "New Alias 2"] },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(200);
			expect(data?.aliases).toEqual(["New Alias 1", "New Alias 2"]);
		});
	});

	describe("DELETE /v2/artist/:id - Delete Artist", () => {
		test("should soft delete an artist with authentication", async () => {
			const token = await getAuthToken();

			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Artist to Delete",
					aliases: [],
				})
				.returning();

			const { status } = await api.v2.artist({ id: artist.id }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(204);

			const [deletedArtist] = await db
				.select()
				.from(artistTable)
				.where(eq(artistTable.id, artist.id))
				.limit(1);
			expect(deletedArtist?.deletedAt).not.toBeNull();
		});

		test("should return 401 without authentication", async () => {
			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Test Artist",
					aliases: [],
				})
				.returning();

			const { status } = await api.v2.artist({ id: artist.id }).delete({}, {});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent artist", async () => {
			const token = await getAuthToken();

			const { status } = await api.v2.artist({ id: 2_000_000_000 }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(404);
		});

		test("should return 404 when trying to delete already deleted artist", async () => {
			const token = await getAuthToken();

			const [artist] = await db
				.insert(artistTable)
				.values({
					name: "Already Deleted",
					aliases: [],
					deletedAt: Temporal.Now.instant(),
				})
				.returning();

			const { error, status } = await api.v2.artist({ id: artist.id }).delete(
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
