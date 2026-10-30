import { type Artist, type DatabaseClient, artist, serializeResult } from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import { ArtistDetailsResponseSchema, type ArtistDetailsResponseDto } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { ArtistId } from "./artistTypes";

export class ArtistReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: ArtistId): Promise<Artist | null> {
		const [row] = await this.db
			.select()
			.from(artist)
			.where(and(eq(artist.id, id), isNull(artist.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async getDetails(id: ArtistId): Promise<ArtistDetailsResponseDto | null> {
		const cacheKey = `catalog:artist:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<ArtistDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.getById(id);
		if (!raw) {
			return null;
		}

		const details = ArtistDetailsResponseSchema.parse(serializeResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
