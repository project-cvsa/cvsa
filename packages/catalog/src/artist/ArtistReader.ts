import type { Artist, DatabaseClient } from "@cvsa/db";
import { transformPrismaResult } from "@cvsa/db";
import { ArtistDetailsResponseSchema, type ArtistDetailsResponseDto } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { ArtistId } from "./artistTypes";

export class ArtistReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: ArtistId): Promise<Artist | null> {
		return this.db.orm.core.Artist.where({ id, deletedAt: null }).first();
	}

	async getDetails(id: ArtistId): Promise<ArtistDetailsResponseDto | null> {
		const cacheKey = `catalog:artist:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<ArtistDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.db.orm.core.Artist.where({ id, deletedAt: null }).first();
		if (!raw) {
			return null;
		}

		const details = ArtistDetailsResponseSchema.parse(transformPrismaResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
