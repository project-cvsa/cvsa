import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@cvsa/db";

const api = treaty(app);

describe("Song E2E Tests", () => {
	async function getAuthToken() {
		const signup = await api.v2.user.post({
			username: `${Math.random()}`,
			password: "password123",
		});
		return signup.data?.data.token;
	}

	describe("GET /v2/song/:id/details - Get Song Details", async () => {
		test("should retrieve a song", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					duration: 180,
				},
			});

			const { data, status } = await api.v2.song({ id: song.id }).details.get();

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Test Song",
				type: "ORIGINAL",
				duration: 180,
			});
		});

		test("should return 404 for nonexistent song", async () => {
			const { error, status } = await api.v2.song({ id: 1099 }).details.get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("POST /v2/song - Create Song", () => {
		test("should create a song with authentication", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "Test Song",
				type: "ORIGINAL" as const,
				duration: 180,
			};

			const { data, status } = await api.v2.song.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				name: "Test Song",
				type: "ORIGINAL",
				duration: 180,
			});
		});

		test("should return 401 without authentication", async () => {
			const payload = {
				name: "Test Song",
			};

			const { error, status } = await api.v2.song.post(payload);

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should create a song with lyrics", async () => {
			const token = await getAuthToken();

			const payload = {
				name: "Lyrics Song",
				type: "ORIGINAL" as const,
				lyrics: [
					{
						language: "zh",
						isTranslated: false,
						plainText: "第一行歌词\n第二行歌词",
						lrc: "[00:00.00]第一行歌词\n[00:05.00]第二行歌词",
						ttml: "<tt></tt>",
					},
				],
			};

			const { data, status } = await api.v2.song.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				name: "Lyrics Song",
			});

			// Verify lyrics were persisted to DB
			const lyrics = await prisma.lyrics.findMany({
				where: { songId: data?.id },
			});
			expect(lyrics).toHaveLength(1);
			expect(lyrics[0]).toMatchObject({
				language: "zh",
				isTranslated: false,
				plainText: "第一行歌词\n第二行歌词",
				lrc: "[00:00.00]第一行歌词\n[00:05.00]第二行歌词",
				ttml: "<tt></tt>",
			});
		});
	});

	describe("PATCH /v2/song/:id - Update Song", () => {
		test("should update a song with authentication", async () => {
			const token = await getAuthToken();

			const song = await prisma.song.create({
				data: {
					name: "Original Name",
				},
			});

			const { data, status } = await api.v2.song({ id: song.id }).patch(
				{ name: "Updated Name" },
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(200);
			expect(data?.name).toBe("Updated Name");
		});

		test("should return 401 without authentication", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
				},
			});

			const { status } = await api.v2.song({ id: song.id }).patch({
				name: "Updated Name",
			});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent song", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2.song({ id: 999999 }).patch(
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

	describe("DELETE /v2/song/:id - Delete Song", () => {
		test("should soft delete a song with authentication", async () => {
			const token = await getAuthToken();

			const song = await prisma.song.create({
				data: {
					name: "Song to Delete",
				},
			});

			const { status } = await api.v2.song({ id: song.id }).delete(
				{},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				}
			);

			expect(status).toBe(204);

			const deletedSong = await prisma.song.findUnique({
				where: { id: song.id },
			});
			expect(deletedSong?.deletedAt).not.toBeNull();
		});

		test("should return 401 without authentication", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
				},
			});

			const { status } = await api.v2.song({ id: song.id }).delete({}, {});

			expect(status).toBe(401);
		});

		test("should return 404 for non-existent song", async () => {
			const token = await getAuthToken();

			const { status } = await api.v2.song({ id: 999999 }).delete(
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
