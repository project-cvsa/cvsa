import { ISearchService } from "../interface";
import type { SingerDetailsResponseDto } from "../../modules";

export interface SingerSearchIndex {
	id: number;
	name?: string;
	description?: string;
	language?: string;
	_vectors?: {
		"potion-multilingual-128M": number[] | null;
	};
}

export class SingerSearchService extends ISearchService<
	SingerDetailsResponseDto,
	SingerSearchIndex
> {
	protected readonly entityType = "singer";

	protected async getDocument(
		singer: SingerDetailsResponseDto,
		language: string,
	): Promise<SingerSearchIndex> {
		const vectors = await this.embeddingManager.embeddings.post({
			texts: [
				`Name: ${this.getName(singer, language) ?? ""}
Description: ${this.getDescription(singer, language) ?? ""}
`,
			],
		});
		return {
			id: singer.id,
			name: this.getName(singer, language) ?? undefined,
			language: singer.language,
			description: this.getDescription(singer, language) ?? undefined,
			_vectors: this.buildVectors(vectors.data?.embeddings[0]),
		};
	}
}
