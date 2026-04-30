import { ISearchService } from "../interface";
import type { ArtistDetailsResponseDto } from "../../modules";

export interface ArtistSearchIndex {
	id: number;
	name?: string;
	description?: string;
	aliases?: string[];
	_vectors?: {
		"potion-multilingual-128M": number[] | null;
	};
}

export class ArtistSearchService extends ISearchService<
	ArtistDetailsResponseDto,
	ArtistSearchIndex
> {
	protected readonly entityType = "artist";

	protected async getDocument(
		artist: ArtistDetailsResponseDto,
		language: string,
	): Promise<ArtistSearchIndex> {
		const vectors = await this.embeddingManager.embeddings.post({
			texts: [
				`Name: ${this.getName(artist, language) ?? ""}
Description: ${this.getDescription(artist, language) ?? ""}
Name Aliases: ${artist.aliases.join(", ")}
`,
			],
		});
		return {
			id: artist.id,
			name: this.getName(artist, language) ?? undefined,
			aliases: artist.aliases,
			description: this.getDescription(artist, language) ?? undefined,
			_vectors: this.buildVectors(vectors.data?.embeddings[0]),
		};
	}
}
