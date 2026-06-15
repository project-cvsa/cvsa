import { describe, expect, mock, test } from "bun:test";
import { SongService, AppError } from "@cvsa/core/internal";
import type { SongDetailsResponseDto, ISongRepository, OutboxService } from "@cvsa/core";
import { createMockRepository } from "../utils";

const mockSongDetails: SongDetailsResponseDto = {
	id: 1,
	type: "ORIGINAL",
	name: "Test Song",
	language: "zh",
	duration: 180,
	description: "A test song",
	coverUrl: "https://example.com/cover.jpg",
	publishedAt: new Date("2024-01-01").toISOString(),
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	originalSongId: null,
	localizedNames: {},
	localizedDescriptions: {},
	bilibiliAid: null,
	bilibiliBvid: null,
	vocadbId: null,
	vcpediaId: null,
	moegirlId: null,
	singers: [],
	artists: [],
	lyrics: [],
};

describe("SongService", () => {
	const mockRepository = createMockRepository<ISongRepository>({
		getById: async (id: number) => {
			if (id === 1) {
				return mockSongDetails;
			}
			return null;
		},
		getDetailsById: async (id: number) => {
			if (id === 1) {
				return mockSongDetails;
			}
			return null;
		},
		create: async () => mockSongDetails,
		update: async () => mockSongDetails,
		softDelete: async () => {},
		createLyrics: async () => ({
			id: 1,
			language: "zh",
			isTranslated: false,
			plainText: "Test lyrics",
			ttml: null,
			lrc: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}),
		getLyricsBySongId: async () => [],
		getLyricById: async () => null,
		updateLyric: async () => ({
			id: 1,
			language: "zh",
			isTranslated: false,
			plainText: "Updated lyrics",
			ttml: null,
			lrc: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}),
		softDeleteLyric: async () => {},
	});

	const mockOutboxService = {
		createEntry: mock(async () => ({
			id: 1,
			aggregateType: "song",
			aggregateId: 1,
			eventType: "song.created",
			payload: null,
			status: "PENDING" as const,
			retryCount: 0,
			lastError: null,
			nextRetryAt: null,
			createdAt: new Date().toISOString(),
			processedAt: null,
		})),
		enqueue: mock(async () => {}),
		processEntry: mock(async () => {}),
		recoverStaleEntries: mock(async () => {}),
	};

	const songService = new SongService(
		mockRepository as unknown as ISongRepository,
		mockOutboxService as unknown as OutboxService
	);

	describe("getDetails", () => {
		test("returns song details when song exists", async () => {
			const result = await songService.getDetails(1);

			expect(result).toEqual(mockSongDetails);
			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getDetailsById.mockResolvedValue(null);

			expect(songService.getDetails(999)).rejects.toThrow(AppError);
			expect(songService.getDetails(999)).rejects.toThrow("error.song.notfound");
			expect(songService.getDetails(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("create", () => {
		const createInput = {
			name: "New Song",
			type: "ORIGINAL" as const,
			duration: 200,
		};

		test("creates song and calls outbox.createEntry", async () => {
			const result = await songService.create(createInput);

			expect(result).toMatchObject({
				name: "Test Song",
				type: "ORIGINAL",
				duration: 180,
			});
			expect(mockRepository.create).toHaveBeenCalled();
		});
	});

	describe("update", () => {
		const updateInput = { name: "Updated Song" };

		test("updates song and calls outbox.createEntry on success", async () => {
			const result = await songService.update(1, updateInput);

			expect(result).toMatchObject({
				name: "Test Song",
				type: "ORIGINAL",
				duration: 180,
			});
			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.update).toHaveBeenCalled();
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.update(999, updateInput)).rejects.toThrow(AppError);
			expect(songService.update(999, updateInput)).rejects.toThrow("error.song.notfound");
			expect(songService.update(999, updateInput)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("delete", () => {
		test("soft deletes song and calls outbox.createEntry on success", async () => {
			await songService.delete(1);

			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.softDelete).toHaveBeenCalled();
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.delete(999)).rejects.toThrow(AppError);
			expect(songService.delete(999)).rejects.toThrow("error.song.notfound");
			expect(songService.delete(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("listLyrics", () => {
		test("returns lyrics when song exists", async () => {
			mockRepository.getLyricsBySongId.mockResolvedValueOnce([
				{
					id: 1,
					language: "zh",
					isTranslated: false,
					plainText: "歌词",
					ttml: null,
					lrc: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			]);

			const result = await songService.listLyrics(1);

			expect(result).toHaveLength(1);
			expect(result[0].language).toBe("zh");
			expect(mockRepository.getLyricsBySongId).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.listLyrics(999)).rejects.toThrow(AppError);
			expect(songService.listLyrics(999)).rejects.toThrow("error.song.notfound");
		});
	});

	describe("getLyric", () => {
		test("returns lyric when song and lyric exist", async () => {
			mockRepository.getLyricById.mockResolvedValueOnce({
				id: 1,
				language: "zh",
				isTranslated: false,
				plainText: "歌词",
				ttml: null,
				lrc: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const result = await songService.getLyric(1, 1);

			expect(result.id).toBe(1);
			expect(result.plainText).toBe("歌词");
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.getLyric(999, 1)).rejects.toThrow(AppError);
			expect(songService.getLyric(999, 1)).rejects.toThrow("error.song.notfound");
		});

		test("throws NOT_FOUND error when lyric does not exist", async () => {
			mockRepository.getLyricById.mockResolvedValueOnce(null);

			expect(songService.getLyric(1, 999)).rejects.toThrow(AppError);
			expect(songService.getLyric(1, 999)).rejects.toThrow("error.lyric.notfound");
		});
	});

	describe("createLyric", () => {
		const createInput = {
			language: "ja" as const,
			isTranslated: true,
			plainText: "日本語の歌詞",
		};

		test("creates lyric when song exists", async () => {
			const result = await songService.createLyric(1, createInput);

			expect(result).toMatchObject({
				language: "zh",
				plainText: "Test lyrics",
			});
			expect(mockRepository.createLyrics).toHaveBeenCalledWith(
				1,
				createInput,
				expect.anything()
			);
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.createLyric(999, createInput)).rejects.toThrow(AppError);
			expect(songService.createLyric(999, createInput)).rejects.toThrow(
				"error.song.notfound"
			);
		});
	});

	describe("updateLyric", () => {
		const updateInput = { plainText: "Updated lyrics" };

		test("updates lyric when song and lyric exist", async () => {
			mockRepository.getLyricById.mockResolvedValueOnce({
				id: 1,
				language: "zh",
				isTranslated: false,
				plainText: "原歌词",
				ttml: null,
				lrc: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const result = await songService.updateLyric(1, 1, updateInput);

			expect(result.plainText).toBe("Updated lyrics");
			expect(mockRepository.updateLyric).toHaveBeenCalledWith(
				1,
				updateInput,
				expect.anything()
			);
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.updateLyric(999, 1, updateInput)).rejects.toThrow(AppError);
			expect(songService.updateLyric(999, 1, updateInput)).rejects.toThrow(
				"error.song.notfound"
			);
		});

		test("throws NOT_FOUND error when lyric does not exist", async () => {
			mockRepository.getLyricById.mockResolvedValueOnce(null);

			expect(songService.updateLyric(1, 999, updateInput)).rejects.toThrow(AppError);
			expect(songService.updateLyric(1, 999, updateInput)).rejects.toThrow(
				"error.lyric.notfound"
			);
		});
	});

	describe("deleteLyric", () => {
		test("soft deletes lyric when song and lyric exist", async () => {
			mockRepository.getLyricById.mockResolvedValueOnce({
				id: 1,
				language: "zh",
				isTranslated: false,
				plainText: "歌词",
				ttml: null,
				lrc: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await songService.deleteLyric(1, 1);

			expect(mockRepository.softDeleteLyric).toHaveBeenCalledWith(1, expect.anything());
		});

		test("throws NOT_FOUND error when song does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(songService.deleteLyric(999, 1)).rejects.toThrow(AppError);
			expect(songService.deleteLyric(999, 1)).rejects.toThrow("error.song.notfound");
		});

		test("throws NOT_FOUND error when lyric does not exist", async () => {
			mockRepository.getLyricById.mockResolvedValueOnce(null);

			expect(songService.deleteLyric(1, 999)).rejects.toThrow(AppError);
			expect(songService.deleteLyric(1, 999)).rejects.toThrow("error.lyric.notfound");
		});
	});
});
