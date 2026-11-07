import { describe, expect, test } from "bun:test";
import { ISearchService, type LocalizableEntity } from "../src/search/interface";

type RepositoryArg = ConstructorParameters<
	typeof ISearchService<LocalizableEntity, { id: number; name: string }>
>[0];
type ManagerArg = ConstructorParameters<
	typeof ISearchService<LocalizableEntity, { id: number; name: string }>
>[1];
type EmbeddingArg = ConstructorParameters<
	typeof ISearchService<LocalizableEntity, { id: number; name: string }>
>[2];

class TestSearchService extends ISearchService<LocalizableEntity, { id: number; name: string }> {
	protected entityType = "test_entity";

	protected async getDocument(entity: LocalizableEntity, _language: string) {
		return {
			id: entity.id,
			name: entity.name ?? "unnamed",
		};
	}
}

describe("SearchService Unit Tests", () => {
	test("throws error when searchManager is not available during sync", async () => {
		const repo = {
			getDetails: async () => ({ id: 1, name: "test" }),
		};
		const service = new TestSearchService(
			repo as unknown as RepositoryArg,
			undefined,
			undefined as unknown as EmbeddingArg
		);

		await expect(service.sync(1)).rejects.toThrow(
			"Search service not available; skipping sync for test_entity 1"
		);
	});

	test("deletes document from all localized indexes when entity is not found", async () => {
		const repo = {
			getDetails: async () => null,
		};
		const deletedIndexes: string[] = [];
		const deletedIds: number[] = [];
		const fakeAdminIndex = {
			deleteDocument: async (id: number) => {
				deletedIds.push(id);
				return { taskUid: 123 };
			},
		};
		const fakeSearchManager = {
			getLocalizedIndexesOfEntity: async () => ["test_entity_zh", "test_entity_en"],
			getAdminIndex: async (indexName: string) => {
				deletedIndexes.push(indexName);
				return fakeAdminIndex;
			},
			waitForTask: async () => {},
		};

		const service = new TestSearchService(
			repo as unknown as RepositoryArg,
			fakeSearchManager as unknown as ManagerArg,
			undefined as unknown as EmbeddingArg
		);
		await service.sync(42);

		expect(deletedIndexes).toEqual(["test_entity_zh", "test_entity_en"]);
		expect(deletedIds).toEqual([42, 42]);
	});

	test("cleans up stale index if language translation was removed", async () => {
		const repo = {
			getDetails: async () => ({
				id: 50,
				language: "zh",
				localizedNames: {
					zh: "中文名",
				},
			}),
		};
		const deletedIndexes: string[] = [];
		const addedToIndex: string[] = [];
		const fakeAdminIndex = {
			deleteDocument: async (_id: number) => {
				return { taskUid: 101 };
			},
			addDocuments: async (_docs: unknown[]) => {
				return { taskUid: 102 };
			},
		};
		const fakeSearchManager = {
			// Pre-existing indexes include 'en' which was removed from localizedNames
			getLocalizedIndexesOfEntity: async () => ["test_entity_zh", "test_entity_en"],
			getAdminIndex: async (indexName: string) => {
				if (indexName === "test_entity_en") {
					deletedIndexes.push(indexName);
				} else {
					addedToIndex.push(indexName);
				}
				return fakeAdminIndex;
			},
			waitForTask: async () => {},
		};

		const service = new TestSearchService(
			repo as unknown as RepositoryArg,
			fakeSearchManager as unknown as ManagerArg,
			undefined as unknown as EmbeddingArg
		);
		await service.sync(50);

		// 'en' index should have deleteDocument called
		expect(deletedIndexes).toEqual(["test_entity_en"]);
		// 'zh' index should have document added
		expect(addedToIndex).toContain("test_entity_zh");
	});
});
