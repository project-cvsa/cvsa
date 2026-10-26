import type { DatabaseClient, Singer } from "@cvsa/db";
import { transformPrismaResult } from "@cvsa/db";
import { SingerDetailsResponseSchema, type SingerDetailsResponseDto } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { SingerId } from "./singerTypes";

export class SingerReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: SingerId): Promise<Singer | null> {
		return this.db.orm.core.Singer.where({ id, deletedAt: null }).first();
	}

	async getDetails(id: SingerId): Promise<SingerDetailsResponseDto | null> {
		const cacheKey = `catalog:singer:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<SingerDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.db.orm.core.Singer.where({ id, deletedAt: null }).first();
		if (!raw) {
			return null;
		}

		const details = SingerDetailsResponseSchema.parse(transformPrismaResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
