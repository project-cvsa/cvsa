import { describe, expect, test } from "bun:test";
import { songRepository, type CreateSongRequestDto, type UpdateSongRequestDto } from "@cvsa/core";
import { prisma } from "@cvsa/db";

const repository = songRepository;

describe("SongRepository Integration Tests", () => {
	describe("create", () => {
		test("should create a song with all fields", async () => {
			const input: CreateSongRequestDto = {
				type: "ORIGINAL",
				name: "Test Song",
				duration: 180,
				description: "A test song",
				coverUrl: "https://example.com/cover.jpg",
				publishedAt: new Date("2024-01-01").toISOString(),
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.type).toBe("ORIGINAL");
			expect(result.name).toBe("Test Song");
			expect(result.duration).toBe(180);
			expect(result.description).toBe("A test song");
			expect(result.coverUrl).toBe("https://example.com/cover.jpg");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should create a song with minimal fields", async () => {
			const input: CreateSongRequestDto = {
				name: "Minimal Song",
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("Minimal Song");
			expect(result.type).toBeNull();
			expect(result.duration).toBeNull();
		});
	});

	describe("getById", () => {
		test("should return song when exists", async () => {
			const created = await repository.create({ name: "Find Me Song" });
			const result = await repository.getById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("Find Me Song");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when song does not exist", async () => {
			const result = await repository.getById(999999);
			expect(result).toBeNull();
		});
	});

	describe("getDetailsById", () => {
		test("should return song when exists", async () => {
			const singer = await prisma.singer.create({
				data: {
					name: "赤羽",
				},
			});
			const artist = await prisma.artist.create({
				data: {
					name: "月华P",
				},
			});
			const artistRole = await prisma.artistRole.create({
				data: {
					name: "作曲",
				},
			});

			const created = await repository.create({
				name: "尘海绘仙缘",
				lyrics: [
					{
						plainText: "捻笔指掌中 遥看日月变",
					},
				],
				performances: [
					{
						singerId: singer.id,
					},
				],
				creations: [
					{
						artistId: artist.id,
						roleId: artistRole.id,
					},
				],
			});
			const result = await repository.getDetailsById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("尘海绘仙缘");
			expect(result?.lyrics).toHaveLength(1);
			expect(result?.lyrics[0]).toMatchObject({
				plainText: "捻笔指掌中 遥看日月变",
			});
			expect(result?.artists).toHaveLength(1);
			expect(result?.artists[0]).toMatchObject({
				name: "月华P",
				role: {
					name: "作曲",
				},
			});
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when song does not exist", async () => {
			const result = await repository.getDetailsById(999999);
			expect(result).toBeNull();
		});
	});

	describe("update", () => {
		test("should update all fields", async () => {
			const created = await repository.create({ name: "Old Name", type: "ORIGINAL" });

			const input: UpdateSongRequestDto = {
				name: "New Name",
				type: "COVER",
				duration: 200,
			};

			const result = await repository.update(created.id, input);

			expect(result.name).toBe("New Name");
			expect(result.type).toBe("COVER");
			expect(result.duration).toBe(200);
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should update only specified fields", async () => {
			const created = await repository.create({
				name: "Original Name",
				type: "ORIGINAL",
				duration: 100,
			});

			const result = await repository.update(created.id, { name: "Updated Name" });

			expect(result.name).toBe("Updated Name");
			expect(result.type).toBe("ORIGINAL");
			expect(result.duration).toBe(100);
		});
	});

	describe("softDelete", () => {
		test("should soft delete a song", async () => {
			const created = await repository.create({ name: "Song to Delete" });

			await repository.softDelete(created.id);

			const result = await repository.getById(created.id);
			expect(result).toBeNull();
		});
	});

	describe("createLyrics", () => {
		test("should create lyrics for a song", async () => {
			const song = await repository.create({ name: "Song with Lyrics" });

			const lyric = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "歌词内容",
			});

			expect(lyric).toBeDefined();
			expect(lyric.id).toBeGreaterThan(0);
			expect(lyric.language).toBe("zh");
			expect(lyric.isTranslated).toBe(false);
			expect(lyric.plainText).toBe("歌词内容");
			expect(lyric.ttml).toBeNull();
			expect(lyric.lrc).toBeNull();
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(lyric.deletedAt).not.toBeDefined();
		});

		test("should create lyrics with optional fields", async () => {
			const song = await repository.create({ name: "Song with Full Lyrics" });

			const lyric = await repository.createLyrics(song.id, {
				language: "ja",
				isTranslated: true,
				plainText: "日本語の歌詞",
				ttml: "<tt>test</tt>",
				lrc: "[00:00.00]test",
			});

			expect(lyric.language).toBe("ja");
			expect(lyric.isTranslated).toBe(true);
			expect(lyric.plainText).toBe("日本語の歌詞");
			expect(lyric.ttml).toBe("<tt>test</tt>");
			expect(lyric.lrc).toBe("[00:00.00]test");
		});
	});

	describe("getLyricsBySongId", () => {
		test("should return all lyrics for a song", async () => {
			const song = await repository.create({
				name: "Song with Multiple Lyrics",
			});

			await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "中文歌词",
			});
			await repository.createLyrics(song.id, {
				language: "en",
				isTranslated: true,
				plainText: "English lyrics",
			});

			const lyrics = await repository.getLyricsBySongId(song.id);

			expect(lyrics).toHaveLength(2);
			expect(lyrics.map((l) => l.language)).toContain("zh");
			expect(lyrics.map((l) => l.language)).toContain("en");
		});

		test("should return empty array when song has no lyrics", async () => {
			const song = await repository.create({ name: "Song without Lyrics" });

			const lyrics = await repository.getLyricsBySongId(song.id);

			expect(lyrics).toEqual([]);
		});

		test("should not return deleted lyrics", async () => {
			const song = await repository.create({ name: "Song with Deleted Lyrics" });

			const lyric = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "将被删除的歌词",
			});
			await repository.softDeleteLyric(lyric.id);

			const lyrics = await repository.getLyricsBySongId(song.id);

			expect(lyrics).toHaveLength(0);
		});
	});

	describe("getLyricById", () => {
		test("should return lyric when exists", async () => {
			const song = await repository.create({ name: "Song" });
			const created = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "歌词",
			});

			const lyric = await repository.getLyricById(created.id);

			expect(lyric).toBeDefined();
			expect(lyric?.id).toBe(created.id);
			expect(lyric?.plainText).toBe("歌词");
		});

		test("should return null when lyric does not exist", async () => {
			const lyric = await repository.getLyricById(999999);

			expect(lyric).toBeNull();
		});

		test("should return null when lyric is deleted", async () => {
			const song = await repository.create({ name: "Song" });
			const created = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "歌词",
			});
			await repository.softDeleteLyric(created.id);

			const lyric = await repository.getLyricById(created.id);

			expect(lyric).toBeNull();
		});
	});

	describe("updateLyric", () => {
		test("should update all fields", async () => {
			const song = await repository.create({ name: "Song" });
			const created = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "原歌词",
			});

			const updated = await repository.updateLyric(created.id, {
				language: "en",
				isTranslated: true,
				plainText: "Updated lyrics",
				ttml: "<tt>updated</tt>",
				lrc: "[00:00.00]updated",
			});

			expect(updated.language).toBe("en");
			expect(updated.isTranslated).toBe(true);
			expect(updated.plainText).toBe("Updated lyrics");
			expect(updated.ttml).toBe("<tt>updated</tt>");
			expect(updated.lrc).toBe("[00:00.00]updated");
		});

		test("should update only specified fields", async () => {
			const song = await repository.create({ name: "Song" });
			const created = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "原歌词",
				ttml: "<tt>original</tt>",
			});

			const updated = await repository.updateLyric(created.id, {
				plainText: "新歌词",
			});

			expect(updated.plainText).toBe("新歌词");
			expect(updated.language).toBe("zh");
			expect(updated.isTranslated).toBe(false);
			expect(updated.ttml).toBe("<tt>original</tt>");
		});
	});

	describe("softDeleteLyric", () => {
		test("should soft delete a lyric", async () => {
			const song = await repository.create({ name: "Song" });
			const created = await repository.createLyrics(song.id, {
				language: "zh",
				isTranslated: false,
				plainText: "将被删除",
			});

			await repository.softDeleteLyric(created.id);

			const lyric = await repository.getLyricById(created.id);
			expect(lyric).toBeNull();
		});
	});
});
