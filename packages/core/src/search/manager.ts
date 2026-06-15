import { MeiliSearch, type Settings, type RecordAny, type IndexOptions } from "meilisearch";
import { env } from "@cvsa/env";
import { INDEX_SETTINGS } from "./config";
import { deepEqualUnordered } from "../utils";
import { appLogger } from "@cvsa/logger";

export class SearchManager {
	private constructor(
		private client?: MeiliSearch,
		private adminClient?: MeiliSearch
	) {}

	/**
	 * Creates a new SearchManager instance with separate search and admin clients.
	 * Initializes MeiliSearch clients using API keys retrieved from the master client.
	 * The search client has only search permissions, while the admin client has full permissions.
	 * Returns a SearchManager instance even if initialization fails - methods will retry initialization on each call.
	 * @returns A promise that resolves to a new SearchManager instance
	 */
	public static async create(customClient?: MeiliSearch, customAdminClient?: MeiliSearch) {
		if (customClient && customAdminClient) {
			return new SearchManager(customClient, customAdminClient);
		}

		const manager = new SearchManager(undefined, undefined);
		await manager.initializeClients();
		return manager;
	}

	/**
	 * Attempts to initialize the MeiliSearch clients.
	 * Safe to call multiple times - will retry if previous initialization failed.
	 */
	private async initializeClients(): Promise<void> {
		if (this.client !== undefined && this.adminClient !== undefined) {
			return;
		}

		try {
			const masterClient = new MeiliSearch({
				host: env.MEILI_API_URL,
				apiKey: env.MEILI_MASTER_KEY,
			});
			const adminKey = await SearchManager.getAdminKey(masterClient);
			const searchKey = await SearchManager.getSearchKey(masterClient);
			this.client = new MeiliSearch({
				host: env.MEILI_API_URL,
				apiKey: searchKey,
			});
			this.adminClient = new MeiliSearch({
				host: env.MEILI_API_URL,
				apiKey: adminKey,
			});
			await this.syncAllSettings();
		} catch (e) {
			appLogger.warn("Cannot initialize SearchManager clients.");
			appLogger.error(Bun.inspect(e));
			throw e;
		}
	}

	private ensureInitialized(): void {
		if (this.client === undefined || this.adminClient === undefined) {
			throw new Error("SearchManager not initialized");
		}
	}

	private static async getOrCreateKey(
		client: MeiliSearch,
		params: { actions: string[]; indexes: string[]; name: string }
	): Promise<string> {
		const { results: keys } = await client.getKeys({ limit: 1000 });

		const existingKey = keys.find(
			(key) =>
				deepEqualUnordered(key.actions, params.actions) &&
				deepEqualUnordered(key.indexes, params.indexes)
		);

		if (existingKey) {
			return existingKey.key;
		}

		const newKey = await client.createKey({
			...params,
			expiresAt: null,
		});

		return newKey.key;
	}

	private static async getAdminKey(client: MeiliSearch): Promise<string> {
		return SearchManager.getOrCreateKey(client, {
			actions: ["*"],
			indexes: ["*"],
			name: "Admin API Key",
		});
	}

	private static async getSearchKey(client: MeiliSearch): Promise<string> {
		return SearchManager.getOrCreateKey(client, {
			actions: ["search"],
			indexes: ["*"],
			name: "Search API Key",
		});
	}

	/**
	 * Waits for a MeiliSearch task to complete.
	 * @param taskUid - The unique identifier of the task to wait for
	 * @returns A promise that resolves to the completed task
	 */
	public async waitForTask(taskUid: number) {
		await this.initializeClients();
		this.ensureInitialized();
		const adminClient = this.adminClient as MeiliSearch;
		return await adminClient.tasks.waitForTask(taskUid, {
			timeout: 10000,
			interval: 100,
		});
	}

	/**
	 * Retrieves a specific task by its UID.
	 * @param taskUid - The unique identifier of the task
	 * @returns A promise that resolves to the task details
	 */
	public async getTask(taskUid: number) {
		await this.initializeClients();
		this.ensureInitialized();
		const adminClient = this.adminClient as MeiliSearch;
		return await adminClient.tasks.getTask(taskUid);
	}

	/**
	 * Returns an admin-index for the specified index name.
	 * Admin index has full permissions including write and delete operations.
	 * @param indexName - The name of the index
	 * @returns The admin MeiliSearch index instance
	 */
	public async getAdminIndex<T extends RecordAny = RecordAny>(indexName: string) {
		await this.initializeClients();
		this.ensureInitialized();
		const adminClient = this.adminClient as MeiliSearch;
		return adminClient.index<T>(indexName);
	}

	/**
	 * Returns a search-index for the specified index name.
	 * Search index has read-only permissions for search operations only.
	 * @param indexName - The name of the index
	 * @returns The search-only MeiliSearch index instance
	 */
	public async getSearchIndex<T extends RecordAny = RecordAny>(indexName: string) {
		await this.initializeClients();
		this.ensureInitialized();
		const client = this.client as MeiliSearch;
		return client.index<T>(indexName);
	}

	/**
	 * Lists all indexes in the MeiliSearch instance.
	 * @returns A promise that resolves to the list of all indexes
	 */
	public async listIndexes() {
		await this.initializeClients();
		this.ensureInitialized();
		const adminClient = this.adminClient as MeiliSearch;
		return adminClient.getIndexes();
	}

	/**
	 * Gets all localized indexes for a given entity name.
	 *
	 * Expects index UIDs in the format `{entityName}_{locale}` (e.g., `artist_zh-CN`).
	 * @param name - The entity name to filter indexes by
	 * @returns A promise that resolves to an array of matching index UIDs
	 */
	public async getLocalizedIndexesOfEntity(name: string) {
		await this.initializeClients();
		this.ensureInitialized();
		const adminClient = this.adminClient as MeiliSearch;
		const { results: indexes } = await adminClient.getIndexes({
			limit: 1000,
		});
		const results: string[] = [];
		for (const index of indexes) {
			const [indexName, _] = index.uid.split("_");
			if (indexName === name) results.push(index.uid);
		}
		return results;
	}

	/**
	 * Synchronizes settings for all indexes with the configured INDEX_SETTINGS.
	 * Only updates settings that differ from current values and triggers reindex
	 * for settings that require it (non-displayedAttributes and non-rankingRules).
	 * Skips indexes without a corresponding entry in INDEX_SETTINGS.
	 */
	public async syncAllSettings() {
		if (this.adminClient === undefined) {
			return;
		}

		const { results: indexes } = await this.listIndexes();
		for (const index of indexes) {
			const uid = index.uid;
			const [name, lang] = uid.split("_");
			if (lang === undefined) continue;
			if (!(name in INDEX_SETTINGS)) continue;
			const settings = INDEX_SETTINGS[name as keyof typeof INDEX_SETTINGS];
			const currentSettings = await index.getSettings();
			for (const [key, value] of Object.entries(settings)) {
				if (deepEqualUnordered(value, currentSettings[key as keyof Settings])) continue;
				// These settings do not trigger a full reindex
				if (["displayedAttributes", "rankingRules"].includes(key)) continue;
				const resetTask = await index.resetSettings();
				await this.waitForTask(resetTask.taskUid);
				const updateTask = await index.updateSettings(settings);
				await this.waitForTask(updateTask.taskUid);
				break;
			}
		}
	}

	/**
	 * Deletes all search indexes in the MeiliSearch instance.
	 * This is a destructive operation that removes all indexes and their data.
	 * Safely no-ops if the admin client is not initialized.
	 */
	public async clearAllIndex() {
		if (this.adminClient === undefined) {
			return;
		}

		const { results: indexes } = await this.listIndexes();
		for (const index of indexes) {
			await this.adminClient.deleteIndexIfExists(index.uid);
			appLogger.info(`Deleted search index ${index.uid}`);
		}
	}

	/**
	 * Creates a new search index with the given UID and optional configuration.
	 * Safely no-ops if the admin client is not initialized.
	 * @param uid - The unique identifier for the index
	 * @param options - Optional index configuration (primary key, etc.)
	 * @returns A promise that resolves to the created index task, or undefined if not initialized
	 */
	public async createIndex(uid: string, options?: IndexOptions) {
		if (this.adminClient === undefined) {
			return;
		}
		return this.adminClient.createIndex(uid, options);
	}
}
