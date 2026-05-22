import type { IRepositoryWithGetDetails } from "@cvsa/core/internal";
import type { SearchManager } from "./manager";
import type { SearchResponse } from "meilisearch";
import type { EmbeddingAppApi } from "@cvsa/embedding";
import { unique, keys } from "remeda";
import { appLogger } from "@cvsa/logger";

export interface LocalizableEntity {
	id: number;
	name?: string | null;
	language: string;
	description?: string | null;
	localizedNames?: Record<string, string> | null;
	localizedDescriptions?: Record<string, string> | null;
}

export abstract class ISearchService<T extends LocalizableEntity, TIndex extends { id: number }> {
	protected abstract readonly entityType: string;

	constructor(
		protected readonly repository: IRepositoryWithGetDetails<T>,
		protected readonly searchManager: SearchManager | undefined,
		protected readonly embeddingManager: EmbeddingAppApi
	) {}

	protected abstract getDocument(entity: T, language: string): Promise<TIndex>;

	protected getName(entity: T, language: string): string | undefined {
		if (language === entity.language) return entity.name ?? undefined;
		return entity.localizedNames?.[language];
	}

	protected getDescription(entity: T, language: string): string | undefined {
		if (language === entity.language) return entity.description ?? undefined;
		return entity.localizedDescriptions?.[language];
	}

	protected collectLanguages(entity: T): string[] {
		return unique([
			...keys(entity.localizedNames ?? {}),
			...keys(entity.localizedDescriptions ?? {}),
			entity.language,
		]);
	}

	protected buildVectors(embedding: number[] | undefined): {
		"potion-multilingual-128M": number[] | null;
	} {
		return embedding
			? { "potion-multilingual-128M": embedding }
			: { "potion-multilingual-128M": null };
	}

	public async sync(id: number): Promise<void> {
		if (!this.searchManager) {
			appLogger.warn("Search service not available");
			return;
		}
		const entity = await this.repository.getDetailsById(id);

		if (!entity) {
			const indexes = await this.searchManager.getLocalizedIndexesOfEntity(this.entityType);
			for (const indexName of indexes) {
				const adminIndex = await this.searchManager.getAdminIndex(indexName);
				const task = await adminIndex.deleteDocument(id);
				await this.searchManager.waitForTask(task.taskUid);
			}
			return;
		}

		const languages = this.collectLanguages(entity);
		for (const language of languages) {
			const indexUid = `${this.entityType}_${language}`;
			const index = await this.searchManager.getAdminIndex<TIndex>(indexUid);
			const document = await this.getDocument(entity, language);
			const task = await index.addDocuments([document], {
				primaryKey: "id",
			});
			await this.searchManager.waitForTask(task.taskUid);
		}
	}

	public async search(query: string, language: string = "zh"): Promise<SearchResponse> {
		if (!this.searchManager) {
			throw new Error("Search or embedding service not available");
		}

		const index = await this.searchManager.getSearchIndex(`${this.entityType}_${language}`);
		const embeddingResponse = await this.embeddingManager.embeddings.post({
			texts: [query],
		});
		const embeddingAvailable = (embeddingResponse?.data?.embeddings[0]?.length ?? 0) > 0;

		return index.search(query, {
			vector: embeddingResponse?.data?.embeddings[0],
			hybrid: embeddingAvailable
				? {
						embedder: "potion-multilingual-128M",
						semanticRatio: 0.25,
					}
				: undefined,
			showRankingScore: true,
		});
	}
}
