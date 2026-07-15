import { describe, expect, mock, test, beforeEach, afterAll } from "bun:test";
import type { SongDetailsResponseDto } from "../../src/modules";
import type { IRepositoryWithGetDetails } from "../../src/types/repository";

// Mock SearchManager
const mockGetLocalizedIndexesOfEntity = mock();
const mockGetAdminIndex = mock();
const mockGetSearchIndex = mock();

const mockAdminIndex = {
	deleteDocument: mock(),
	addDocuments: mock(),
	search: mock(),
};

const mockSearchIndex = {
	search: mock(),
};

const mockSearchManager = {
	getLocalizedIndexesOfEntity: mockGetLocalizedIndexesOfEntity,
	getAdminIndex: mockGetAdminIndex,
	getSearchIndex: mockGetSearchIndex,
	waitForTask: mock().mockResolvedValue(undefined),
};

// Mock EmbeddingAppApi
const mockEmbeddingsPost = mock();
const mockEmbeddingManager = {
	embeddings: {
		post: mockEmbeddingsPost,
	},
};

// Import after mocking
const { SongSearchService } = await import("../../src/search/catalog/song");

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
	localizedNames: { en: "Test Song EN", ja: "テストソング" },
	localizedDescriptions: { en: "A test song in English" },
	bilibiliAid: null,
	bilibiliBvid: null,
	vocadbId: null,
	vcpediaId: null,
	moegirlId: null,
	singers: [
		{
			id: 1,
			name: "Singer 1",
			language: "zh",
			localizedNames: { en: "Singer 1 EN" },
			engine: "SynthV",
			description: null,
			localizedDescriptions: null,
			createdAt: "",
			updatedAt: "",
			avatarUrl: null,
		},
	],
	artists: [
		{
			id: 1,
			name: "Artist 1",
			language: "zh",
			localizedNames: { en: "Artist 1 EN" },
			description: null,
			localizedDescriptions: null,
			createdAt: "",
			updatedAt: "",
			aliases: [],
			userId: null,
			role: {
				language: "zh",
				id: 1,
				name: "",
				localizedNames: null,
				createdAt: "",
				updatedAt: "",
				deletedAt: null,
			},
		},
	],
	lyrics: [
		{
			language: "zh",
			plainText: "歌词内容",
			isTranslated: false,
			ttml: "",
			lrc: "",
			id: 1,
			createdAt: "",
			updatedAt: "",
			songId: 1,
		},
		{
			language: "en",
			plainText: "Lyrics content",
			isTranslated: true,
			ttml: "",
			lrc: "",
			id: 1,
			createdAt: "",
			updatedAt: "",
			songId: 1,
		},
	],
	externalLinks: [],
};

describe("SongSearchService", () => {
	let service: InstanceType<typeof SongSearchService>;
	let mockRepository: IRepositoryWithGetDetails<SongDetailsResponseDto>;

	beforeEach(() => {
		mockGetLocalizedIndexesOfEntity.mockClear();
		mockGetAdminIndex.mockClear();
		mockGetSearchIndex.mockClear();
		mockAdminIndex.deleteDocument.mockClear();
		mockAdminIndex.addDocuments.mockClear();
		mockAdminIndex.search.mockClear();
		mockSearchIndex.search.mockClear();
		mockEmbeddingsPost.mockClear();

		mockGetAdminIndex.mockResolvedValue(mockAdminIndex);
		mockGetSearchIndex.mockResolvedValue(mockSearchIndex);
		mockAdminIndex.deleteDocument.mockResolvedValue({ taskUid: 1 });
		mockAdminIndex.addDocuments.mockResolvedValue({ taskUid: 1 });
		mockEmbeddingsPost.mockResolvedValue({
			data: { embeddings: [[0.1, 0.2, 0.3]] },
		});

		mockRepository = {
			getDetailsById: mock(),
		};

		service = new SongSearchService(
			mockRepository,
			mockSearchManager as never,
			mockEmbeddingManager as never
		);
	});

	afterAll(() => {
		mock.restore();
		mock.clearAllMocks();
	});

	describe("sync", () => {
		test("syncs song to all language indexes", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			expect(callArgs[1]).toEqual({ primaryKey: "id" });
		});

		test("deletes document from all indexes when song not found", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(null);
			mockGetLocalizedIndexesOfEntity.mockResolvedValue(["song_zh", "song_en"]);

			await service.sync(999);

			expect(mockGetLocalizedIndexesOfEntity).toHaveBeenCalledWith("song");
			expect(mockGetAdminIndex).toHaveBeenCalledTimes(2);
			expect(mockAdminIndex.deleteDocument).toHaveBeenCalledTimes(2);
			expect(mockAdminIndex.deleteDocument).toHaveBeenCalledWith(999);
		});

		test("handles missing search manager gracefully", async () => {
			const serviceWithoutManager = new SongSearchService(
				mockRepository,
				undefined as never,
				mockEmbeddingManager as never
			);

			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await serviceWithoutManager.sync(1);

			expect(mockRepository.getDetailsById).not.toHaveBeenCalled();
		});

		test("builds document with localized content", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			expect(callArgs).toBeDefined();
			const docs = callArgs[0] as { id: number; name: string }[];
			expect(docs[0].id).toBe(1);
			expect(docs[0].name).toBe("Test Song EN");
		});

		test("handles song with no localized content", async () => {
			const songWithoutLocalization = {
				...mockSongDetails,
				localizedNames: {},
				localizedDescriptions: {},
				singers: [{ ...mockSongDetails.singers[0], localizedNames: {} }],
				artists: [{ ...mockSongDetails.artists[0], localizedNames: {} }],
			};
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				songWithoutLocalization
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
		});

		test("handles embedding generation failure", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);
			mockEmbeddingsPost.mockResolvedValue({
				data: null,
			});

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const doc = mockAdminIndex.addDocuments.mock.calls[0][0][0];
			expect(doc._vectors).toEqual({
				"potion-multilingual-128M": null,
			});
		});
	});

	describe("search", () => {
		test("performs hybrid search with embedding", async () => {
			const mockSearchResult = {
				hits: [{ id: 1, name: "Test Song" }],
				query: "test",
				processingTimeMs: 30,
				offset: 1,
				limit: 1,
				estimatedTotalHits: 1,
			};
			mockSearchIndex.search.mockResolvedValue(mockSearchResult);

			const result = await service.search("test query", "zh");

			expect(mockGetSearchIndex).toHaveBeenCalledWith("song_zh");
			expect(mockEmbeddingsPost).toHaveBeenCalledWith({ texts: ["test query"] });
			expect(mockSearchIndex.search).toHaveBeenCalledWith("test query", {
				vector: [0.1, 0.2, 0.3],
				hybrid: {
					embedder: "potion-multilingual-128M",
					semanticRatio: 0.25,
				},
				showRankingScore: true,
			});
			expect(result).toEqual(mockSearchResult);
		});

		test("uses default language when not specified", async () => {
			mockSearchIndex.search.mockResolvedValue({ hits: [] });

			await service.search("test");

			expect(mockGetSearchIndex).toHaveBeenCalledWith("song_zh");
		});

		test("throws when search manager not available", async () => {
			const serviceWithoutManager = new SongSearchService(
				mockRepository,
				undefined as never,
				mockEmbeddingManager as never
			);

			expect(serviceWithoutManager.search("test")).rejects.toThrow(
				"Search or embedding service not available"
			);
		});

		test("handles missing embedding response gracefully", async () => {
			mockEmbeddingsPost.mockResolvedValue({ data: null });
			mockSearchIndex.search.mockResolvedValue({ hits: [] });

			await service.search("test", "zh");

			expect(mockSearchIndex.search).toHaveBeenCalledWith("test", {
				vector: undefined,
				hybrid: undefined,
				showRankingScore: true,
			});
		});
	});

	describe("getDocument (via sync)", () => {
		test("uses correct lyrics for language", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			expect(callArgs).toBeDefined();
			const docs = callArgs[0] as { lyrics?: string }[];
			expect(docs[0].lyrics).toBeDefined();
		});

		test("uses correct description for language", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const allCalls = mockAdminIndex.addDocuments.mock.calls;
			const zhCall = allCalls.find((call: unknown[]) => {
				const docs = call[0] as { description?: string }[];
				return docs[0].description === "A test song";
			});
			expect(zhCall).toBeDefined();
		});

		test("uses localized description when available", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callsCount = mockAdminIndex.addDocuments.mock.calls.length;
			expect(callsCount).toBeGreaterThan(0);
		});

		test("extracts localized singer names", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			const docs = callArgs[0] as { singers?: string[] }[];
			expect(docs[0].singers).toBeDefined();
		});

		test("extracts localized artist names", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			const docs = callArgs[0] as { artists?: string[] }[];
			expect(docs[0].artists).toBeDefined();
		});

		test("extracts engine from singers", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			const docs = callArgs[0] as { engine?: string[] }[];
			expect(docs[0].engine).toContain("SynthV");
		});

		test("converts publishedAt to timestamp", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockSongDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			const docs = callArgs[0] as { publishedAt?: number }[];
			expect(docs[0].publishedAt).toBeTypeOf("number");
			expect(docs[0].publishedAt).toBe(new Date("2024-01-01").getTime());
		});

		test("handles null publishedAt", async () => {
			const songWithoutDate = {
				...mockSongDetails,
				publishedAt: null,
			};
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				songWithoutDate
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0];
			const docs = callArgs[0] as { publishedAt?: number }[];
			expect(docs[0].publishedAt).toBeUndefined();
		});
	});
});
