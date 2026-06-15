import { describe, expect, mock, test, beforeEach } from "bun:test";
import type { Index, RecordAny, Task, MeiliSearch as MeiliSearchType } from "meilisearch";
import { SearchManager } from "../../src/search/manager";

interface MockClient {
	index: ReturnType<typeof mock>;
	getIndexes: ReturnType<typeof mock>;
	getKeys?: ReturnType<typeof mock>;
	createKey?: ReturnType<typeof mock>;
	tasks?: {
		waitForTask: ReturnType<typeof mock>;
		getTask: ReturnType<typeof mock>;
	};
}

const mockGetKeys = mock();
const mockCreateKey = mock();
const mockGetIndexes = mock();
const mockWaitForTask = mock();
const mockGetTask = mock();
const mockIndexGetSettings = mock();
const mockIndexResetSettings = mock(() => {
	return { taskUid: 1 };
});
const mockIndexUpdateSettings = mock(() => {
	return { taskUid: 1 };
});
const mockAdminDeleteIndexIfExists = mock();
const mockAdminCreateIndex = mock();

const mockIndexInstance = {
	getSettings: mockIndexGetSettings,
	resetSettings: mockIndexResetSettings,
	updateSettings: mockIndexUpdateSettings,
	deleteDocument: mock(),
	addDocuments: mock(),
	search: mock(),
};

const createMockIndex = (uid: string, getSettingsReturn?: Record<string, unknown>) => {
	const settingsMock = mock();
	settingsMock.mockResolvedValue(
		getSettingsReturn ?? {
			searchableAttributes: [],
			filterableAttributes: [],
			sortableAttributes: [],
			rankingRules: [],
		}
	);
	return {
		uid,
		getSettings: settingsMock,
		resetSettings: mockIndexResetSettings,
		updateSettings: mockIndexUpdateSettings,
		deleteDocument: mock(),
		addDocuments: mock(),
		search: mock(),
	};
};

const createMockClient = (): { client: MockClient; adminClient: MockClient } => {
	const client = {
		index: mock(() => mockIndexInstance),
		getIndexes: mockGetIndexes,
	};
	const adminClient = {
		index: mock(() => mockIndexInstance),
		getIndexes: mockGetIndexes,
		getKeys: mockGetKeys,
		createKey: mockCreateKey,
		deleteIndexIfExists: mockAdminDeleteIndexIfExists,
		createIndex: mockAdminCreateIndex,
		tasks: {
			waitForTask: mockWaitForTask,
			getTask: mockGetTask,
		},
	};
	return { client, adminClient };
};

describe("SearchManager", () => {
	beforeEach(() => {
		mockGetKeys.mockClear();
		mockCreateKey.mockClear();
		mockGetIndexes.mockClear();
		mockIndexGetSettings.mockClear();
		mockIndexResetSettings.mockClear();
		mockIndexUpdateSettings.mockClear();
		mockWaitForTask.mockClear();
		mockGetTask.mockClear();
		mockAdminDeleteIndexIfExists.mockClear();
		mockAdminCreateIndex.mockClear();
	});

	describe("create with custom clients", () => {
		test("creates instance with provided clients", async () => {
			const { client, adminClient } = createMockClient();

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			expect(manager).toBeDefined();
		});
	});

	describe("getLocalizedIndexesOfEntity", () => {
		test("returns indexes matching entity name", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [
					createMockIndex("song_zh-CN"),
					createMockIndex("song_en"),
					createMockIndex("artist_zh-CN"),
					createMockIndex("no-locale"),
				],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const indexes = await manager.getLocalizedIndexesOfEntity("song");

			expect(indexes).toEqual(["song_zh-CN", "song_en"]);
		});

		test("returns empty array when no matching indexes", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [createMockIndex("artist_zh-CN")],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const indexes = await manager.getLocalizedIndexesOfEntity("song");

			expect(indexes).toEqual([]);
		});
	});

	describe("syncAllSettings", () => {
		test("syncs settings when they differ", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [
					createMockIndex("song_zh-CN", {
						searchableAttributes: ["old"],
						filterableAttributes: [],
						sortableAttributes: [],
						rankingRules: [],
					}),
				],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.syncAllSettings();

			expect(mockIndexResetSettings).toHaveBeenCalled();
			expect(mockIndexUpdateSettings).toHaveBeenCalled();
		});

		test("skips sync when settings match", async () => {
			const { client, adminClient } = createMockClient();
			const matchingSettings = {
				searchableAttributes: [
					"name",
					"lyrics",
					"description",
					"singers",
					"artists",
					"bilibiliAid",
					"bilibiliBvid",
				],
				filterableAttributes: ["type", "tags", "singers", "engine"],
				sortableAttributes: ["publishedAt", "bilibiliViews"],
				rankingRules: ["attribute", "words", "proximity", "exactness", "typo", "sort"],
				embedders: {
					"potion-multilingual-128M": {
						source: "userProvided",
						dimensions: 256,
					},
				},
			};

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [createMockIndex("song_zh-CN", matchingSettings)],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.syncAllSettings();

			expect(mockIndexResetSettings).not.toHaveBeenCalled();
			expect(mockIndexUpdateSettings).not.toHaveBeenCalled();
		});

		test("skips indexes without locale suffix", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [createMockIndex("song")],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.syncAllSettings();

			expect(mockIndexResetSettings).not.toHaveBeenCalled();
			expect(mockIndexUpdateSettings).not.toHaveBeenCalled();
		});

		test("skips indexes not in INDEX_SETTINGS", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [createMockIndex("unknown_zh-CN")],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.syncAllSettings();

			expect(mockIndexResetSettings).not.toHaveBeenCalled();
			expect(mockIndexUpdateSettings).not.toHaveBeenCalled();
		});
	});

	describe("getAdminIndex", () => {
		test("returns admin index instance", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const index = await manager.getAdminIndex("song_zh-CN");

			expect(index).toBeDefined();
		});
	});

	describe("getSearchIndex", () => {
		test("returns search index instance", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const index = await manager.getSearchIndex("song_zh-CN");

			expect(index).toBeDefined();
		});
	});

	describe("listIndexes", () => {
		test("returns list of all indexes", async () => {
			const { client, adminClient } = createMockClient();
			const mockIndexes = [
				createMockIndex("song_zh-CN"),
				createMockIndex("song_en"),
			] as unknown as Index<RecordAny>[];
			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({ results: mockIndexes });

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const indexes = await manager.listIndexes();

			expect(indexes.results).toEqual(mockIndexes);
		});
	});

	describe("waitForTask", () => {
		test("waits for task completion", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			const mockTask = { uid: 123, status: "succeeded" } as Task;
			mockWaitForTask.mockResolvedValue(mockTask);

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const task = await manager.waitForTask(123);

			expect(task).toEqual(mockTask);
			expect(mockWaitForTask).toHaveBeenCalledWith(123, {
				timeout: 10000,
				interval: 100,
			});
		});
	});

	describe("getTask", () => {
		test("returns task details", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			const mockTask = { uid: 123, status: "succeeded" } as Task;
			mockGetTask.mockResolvedValue(mockTask);

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const task = await manager.getTask(123);

			expect(task).toEqual(mockTask);
		});
	});

	describe("clearAllIndex", () => {
		test("deletes all existing indexes", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({
				results: [createMockIndex("song_zh-CN"), createMockIndex("artist_en")],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.clearAllIndex();

			expect(mockAdminDeleteIndexIfExists).toHaveBeenCalledTimes(2);
			expect(mockAdminDeleteIndexIfExists).toHaveBeenCalledWith("song_zh-CN");
			expect(mockAdminDeleteIndexIfExists).toHaveBeenCalledWith("artist_en");
		});

		test("handles empty index list gracefully", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});
			mockGetIndexes.mockResolvedValue({ results: [] });

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.clearAllIndex();

			expect(mockAdminDeleteIndexIfExists).not.toHaveBeenCalled();
		});
	});

	describe("createIndex", () => {
		test("creates a new index via admin client", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			await manager.createIndex("album_zh");

			expect(mockAdminCreateIndex).toHaveBeenCalledWith("album_zh", undefined);
		});

		test("passes options to createIndex when provided", async () => {
			const { client, adminClient } = createMockClient();

			mockGetKeys.mockResolvedValue({
				results: [
					{ key: "admin-key", actions: ["*"], indexes: ["*"] },
					{ key: "search-key", actions: ["search"], indexes: ["*"] },
				],
			});

			const manager = await SearchManager.create(
				client as unknown as MeiliSearchType,
				adminClient as unknown as MeiliSearchType
			);
			const options = { primaryKey: "id" };
			await manager.createIndex("album_zh", options);

			expect(mockAdminCreateIndex).toHaveBeenCalledWith("album_zh", options);
		});
	});
});
