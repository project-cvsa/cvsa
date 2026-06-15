import { describe, expect, mock, test, beforeEach, afterAll } from "bun:test";
import type { ArtistDetailsResponseDto } from "../../src/modules";
import type { IRepositoryWithGetDetails } from "../../src/types/repository";

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

const mockEmbeddingsPost = mock();
const mockEmbeddingManager = {
	embeddings: {
		post: mockEmbeddingsPost,
	},
};

const { ArtistSearchService } = await import("../../src/search/catalog/artist");

const mockArtistDetails: ArtistDetailsResponseDto = {
	id: 1,
	name: "Test Artist",
	language: "zh",
	aliases: ["Alias1", "Alias2"],
	description: "A test artist",
	localizedNames: { en: "Test Artist EN", ja: "テストアーティスト" },
	localizedDescriptions: { en: "A test artist in English" },
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	userId: null,
};

describe("ArtistSearchService", () => {
	let service: InstanceType<typeof ArtistSearchService>;
	let mockRepository: IRepositoryWithGetDetails<ArtistDetailsResponseDto>;

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

		service = new ArtistSearchService(
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
		test("syncs artist to all language indexes", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockArtistDetails
			);

			await service.sync(1);

			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const callArgs = mockAdminIndex.addDocuments.mock.calls[0] as unknown[];
			expect(callArgs[1]).toEqual({ primaryKey: "id" });
		});

		test("deletes document from all indexes when artist not found", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(null);
			mockGetLocalizedIndexesOfEntity.mockResolvedValue(["artist_zh", "artist_en"]);

			await service.sync(999);

			expect(mockGetLocalizedIndexesOfEntity).toHaveBeenCalledWith("artist");
			expect(mockGetAdminIndex).toHaveBeenCalledTimes(2);
			expect(mockAdminIndex.deleteDocument).toHaveBeenCalledTimes(2);
			expect(mockAdminIndex.deleteDocument).toHaveBeenCalledWith(999);
		});

		test("handles missing search manager gracefully", async () => {
			const serviceWithoutManager = new ArtistSearchService(
				mockRepository,
				undefined as never,
				mockEmbeddingManager as never
			);

			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockArtistDetails
			);

			await serviceWithoutManager.sync(1);

			expect(mockRepository.getDetailsById).not.toHaveBeenCalled();
		});

		test("builds document with localized content", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockArtistDetails
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const allCalls = mockAdminIndex.addDocuments.mock.calls as unknown as [
				{ id: number; name: string }[],
				unknown,
			][];
			const enCall = allCalls.find((call) => call[0][0].name === "Test Artist EN");
			expect(enCall).toBeDefined();
		});

		test("handles artist with no localized content", async () => {
			const artistWithoutLocalization = {
				...mockArtistDetails,
				localizedNames: {},
				localizedDescriptions: {},
			};
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				artistWithoutLocalization
			);

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
		});

		test("handles embedding generation failure", async () => {
			(mockRepository.getDetailsById as ReturnType<typeof mock>).mockResolvedValue(
				mockArtistDetails
			);
			mockEmbeddingsPost.mockResolvedValue({
				data: null,
			});

			await service.sync(1);

			expect(mockAdminIndex.addDocuments).toHaveBeenCalled();
			const doc = (
				(mockAdminIndex.addDocuments.mock.calls[0] as unknown[])[0] as {
					_vectors: { "potion-multilingual-128M": unknown };
				}[]
			)[0];
			expect(doc._vectors).toEqual({
				"potion-multilingual-128M": null,
			});
		});
	});

	describe("search", () => {
		test("performs hybrid search with embedding", async () => {
			const mockSearchResult = {
				hits: [{ id: 1, name: "Test Artist" }],
				query: "test",
				processingTimeMs: 30,
				offset: 1,
				limit: 1,
				estimatedTotalHits: 1,
			};
			mockSearchIndex.search.mockResolvedValue(mockSearchResult);

			const result = await service.search("test query", "zh");

			expect(mockGetSearchIndex).toHaveBeenCalledWith("artist_zh");
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

			expect(mockGetSearchIndex).toHaveBeenCalledWith("artist_zh");
		});

		test("throws when search manager not available", async () => {
			const serviceWithoutManager = new ArtistSearchService(
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
});
