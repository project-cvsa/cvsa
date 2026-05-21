import { ISearchService } from "../interface";
import type { ArtistRoleDetailsResponseDto } from "../../modules";

export interface ArtistRoleSearchIndex {
	id: number;
	name: string;
	localizedNames?: Record<string, string> | null;
	_vectors?: {
		"potion-multilingual-128M": number[] | null;
	};
}

export class ArtistRoleSearchService extends ISearchService<
	ArtistRoleDetailsResponseDto,
	ArtistRoleSearchIndex
> {
	protected readonly entityType = "artistRole";

	protected async getDocument(
		role: ArtistRoleDetailsResponseDto,
		language: string,
	): Promise<ArtistRoleSearchIndex> {
		const vectors = await this.embeddingManager.embeddings.post({
			texts: [`Name: ${this.getName(role, language) ?? ""}`],
		});
		return {
			id: role.id,
			name: this.getName(role, language) ?? "",
			localizedNames: role.localizedNames,
			_vectors: this.buildVectors(vectors.data?.embeddings[0]),
		};
	}
}
