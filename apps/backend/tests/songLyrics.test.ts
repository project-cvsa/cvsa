import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { prisma } from "@cvsa/db";

const api = treaty(app);

describe("Song Lyrics E2E Tests", () => {
	async function getAuthToken() {
		const signup = await api.v2.user.post({
			username: `${Math.random()}`,
			password: "password123",
		});
		return signup.data?.data.token;
	}

	describe("GET /v2/song/:id/lyrics - List Song Lyrics", () => {
		test("should return empty array when song has no lyrics", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
				},
			});

			const { data, status } = await api.v2.song({ id: song.id }).lyrics.get();

			expect(status).toBe(200);
			expect(data).toEqual([]);
		});

		test("should return all lyrics for a song", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "第一行歌词",
							},
							{
								language: "en",
								isTranslated: true,
								plainText: "First line lyrics",
							},
						],
					},
				},
			});

			const { data, status } = await api.v2.song({ id: song.id }).lyrics.get();

			expect(status).toBe(200);
			expect(data).toHaveLength(2);
			expect(data?.[0]).toMatchObject({
				language: expect.any(String),
				isTranslated: expect.any(Boolean),
			});
		});

		test("should return 404 for nonexistent song", async () => {
			const { error, status } = await api.v2.song({ id: 99999 }).lyrics.get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});

		test("should not return deleted lyrics", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "第一行歌词",
								deletedAt: new Date(),
							},
							{
								language: "en",
								isTranslated: true,
								plainText: "First line lyrics",
							},
						],
					},
				},
			});

			const { data, status } = await api.v2.song({ id: song.id }).lyrics.get();

			expect(status).toBe(200);
			expect(data).toHaveLength(1);
			expect(data?.[0].language).toBe("en");
		});
	});

	describe("GET /v2/song/:id/lyric/:lyricId - Get Specific Lyric", () => {
		test("should return a specific lyric", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "第一行歌词",
							},
						],
					},
				},
			});

			const lyrics = await prisma.lyrics.findFirst({
				where: { songId: song.id },
			});
			expect(lyrics).not.toBeNull();
			if (!lyrics) return;

			const { data, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: lyrics.id })
				.get();

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: lyrics.id,
				language: "zh",
				isTranslated: false,
				plainText: "第一行歌词",
			});
		});

		test("should return 404 for nonexistent song", async () => {
			const { error, status } = await api.v2.song({ id: 99999 }).lyric({ lyricId: 1 }).get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});

		test("should return 404 for nonexistent lyric", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
				},
			});

			const { error, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: 99999 })
				.get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});

		test("should return 404 for deleted lyric", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "第一行歌词",
								deletedAt: new Date(),
							},
						],
					},
				},
			});

			const lyrics = await prisma.lyrics.findFirst({
				where: { songId: song.id },
			});
			expect(lyrics).not.toBeNull();
			if (!lyrics) return;

			const { error, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: lyrics.id })
				.get();

			expect(status).toBe(404);
			expect(error?.value).toMatchObject({
				code: "NOT_FOUND",
			});
		});
	});

	describe("POST /v2/song/:id/lyric - Create Lyric", () => {
		test("should create a lyric with authentication", async () => {
			const token = await getAuthToken();
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
				},
			});

			const payload = {
				language: "ja",
				isTranslated: true,
				plainText: "日本語の歌詞",
				lrc: "[00:00.00]日本語の歌詞",
				ttml: "<tt>日本語の歌詞</tt>",
			};

			const { data, status } = await api.v2.song({ id: song.id }).lyric.post(payload, {
				headers: {
					authorization: `Bearer ${token}`,
				},
			});

			expect(status).toBe(201);
			expect(data).toMatchObject({
				id: expect.any(Number),
				language: "ja",
				isTranslated: true,
				plainText: "日本語の歌詞",
				lrc: "[00:00.00]日本語の歌詞",
				ttml: "<tt>日本語の歌詞</tt>",
			});
		});

		test("should return 401 without authentication", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
				},
			});

			const { error, status } = await api.v2.song({ id: song.id }).lyric.post({
				language: "zh",
				plainText: "歌词",
			});

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should return 404 for nonexistent song", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2.song({ id: 99999 }).lyric.post(
				{
					language: "zh",
					plainText: "歌词",
				},
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

	describe("PATCH /v2/song/:id/lyric/:lyricId - Update Lyric", () => {
		test("should update a lyric with authentication", async () => {
			const token = await getAuthToken();
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "原歌词",
							},
						],
					},
				},
			});

			const lyrics = await prisma.lyrics.findFirst({
				where: { songId: song.id },
			});
			expect(lyrics).not.toBeNull();
			if (!lyrics) return;

			const { data, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: lyrics.id })
				.patch(
					{
						language: "en",
						isTranslated: true,
						plainText: "Updated lyrics",
					},
					{
						headers: {
							authorization: `Bearer ${token}`,
						},
					}
				);

			expect(status).toBe(200);
			expect(data).toMatchObject({
				id: lyrics.id,
				language: "en",
				isTranslated: true,
				plainText: "Updated lyrics",
			});
		});

		test("should return 401 without authentication", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "歌词",
							},
						],
					},
				},
			});

			const lyrics = await prisma.lyrics.findFirst({
				where: { songId: song.id },
			});
			expect(lyrics).not.toBeNull();
			if (!lyrics) return;

			const { error, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: lyrics.id })
				.patch({
					plainText: "Updated lyrics",
				});

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should return 404 for nonexistent song", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2
				.song({ id: 99999 })
				.lyric({ lyricId: 1 })
				.patch(
					{
						plainText: "Updated lyrics",
					},
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

		test("should return 404 for nonexistent lyric", async () => {
			const token = await getAuthToken();
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
				},
			});

			const { error, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: 99999 })
				.patch(
					{
						plainText: "Updated lyrics",
					},
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

	describe("DELETE /v2/song/:id/lyric/:lyricId - Delete Lyric", () => {
		test("should soft delete a lyric with authentication", async () => {
			const token = await getAuthToken();
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "歌词",
							},
						],
					},
				},
			});

			const lyrics = await prisma.lyrics.findFirst({
				where: { songId: song.id },
			});
			expect(lyrics).not.toBeNull();
			if (!lyrics) return;

			const { status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: lyrics.id })
				.delete(
					{},
					{
						headers: {
							authorization: `Bearer ${token}`,
						},
					}
				);

			expect(status).toBe(204);

			const deletedLyric = await prisma.lyrics.findUnique({
				where: { id: lyrics.id },
			});
			expect(deletedLyric?.deletedAt).not.toBeNull();
		});

		test("should return 401 without authentication", async () => {
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
					lyrics: {
						create: [
							{
								language: "zh",
								isTranslated: false,
								plainText: "歌词",
							},
						],
					},
				},
			});

			const lyrics = await prisma.lyrics.findFirst({
				where: { songId: song.id },
			});
			expect(lyrics).not.toBeNull();
			if (!lyrics) return;

			const { error, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: lyrics.id })
				.delete({}, {});

			expect(status).toBe(401);
			expect(error?.value).toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		test("should return 404 for nonexistent song", async () => {
			const token = await getAuthToken();

			const { error, status } = await api.v2
				.song({ id: 99999 })
				.lyric({ lyricId: 1 })
				.delete(
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

		test("should return 404 for nonexistent lyric", async () => {
			const token = await getAuthToken();
			const song = await prisma.song.create({
				data: {
					name: "Test Song",
					type: "ORIGINAL",
				},
			});

			const { error, status } = await api.v2
				.song({ id: song.id })
				.lyric({ lyricId: 99999 })
				.delete(
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
