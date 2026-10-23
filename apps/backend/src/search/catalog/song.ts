import type { SongType } from "@cvsa/db";
import { ISearchService } from "../interface";
import type { SongDetailsResponseDto } from "@cvsa/contracts";

export interface SongSearchIndex {
	id: number;
	name?: string;
	lyrics?: string;
	description?: string;
	singers?: string[];
	artists?: string[];
	bilibiliAid?: number;
	bilibiliBvid?: string;
	type?: SongType;
	tags?: string[];
	engine?: string[];
	publishedAt?: number;
	bilibiliViews?: number;
	_vectors?: {
		"potion-multilingual-128M": number[] | null;
	};
}

export class SongSearchService extends ISearchService<SongDetailsResponseDto, SongSearchIndex> {
	protected readonly entityType = "song";

	protected async getDocument(
		song: SongDetailsResponseDto,
		language: string
	): Promise<SongSearchIndex> {
		const getLyrics = () => {
			return song.lyrics.find((item) => item.language === language)?.plainText;
		};
		const getSingers = () => {
			const data = song.singers.map((item) => {
				return item.localizedNames?.[language] ?? item.name;
			});
			return data.filter((item): item is string => Boolean(item));
		};
		const getArtists = () => {
			const data = song.artists.map((item) => {
				return item.localizedNames?.[language] ?? item.name;
			});
			return data.filter((item): item is string => Boolean(item));
		};

		const vectors = await this.embeddingManager.embeddings.post({
			texts: [
				`Name: ${this.getName(song, language) ?? ""}
Lyrics: ${getLyrics() ?? ""}
Description: ${this.getDescription(song, language) ?? ""}
Singers: ${getSingers().join(", ")}
Artists: ${getArtists().join(", ")}
`,
			],
		});
		return {
			id: song.id,
			name: this.getName(song, language) ?? undefined,
			lyrics: getLyrics() ?? undefined,
			description: this.getDescription(song, language) ?? undefined,
			singers: getSingers(),
			artists: getArtists(),
			bilibiliAid: song.bilibiliAid ?? undefined,
			bilibiliBvid: song.bilibiliBvid ?? undefined,
			type: song.type ?? undefined,
			engine: song.singers
				.map((item) => item.engine)
				.filter((e): e is string => typeof e === "string"),
			publishedAt: song.publishedAt ? new Date(song.publishedAt).getTime() : undefined,
			_vectors: this.buildVectors(vectors.data?.embeddings[0]),
		};
	}
}
