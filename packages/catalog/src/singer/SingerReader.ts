import { type DatabaseClient, type Singer, serializeResult, singer } from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import { SingerDetailsResponseSchema, type SingerDetailsResponseDto } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { SingerId } from "./singerTypes";

export class SingerReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: SingerId): Promise<Singer | null> {
		const [row] = await this.db
			.select()
			.from(singer)
			.where(and(eq(singer.id, id), isNull(singer.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async getDetails(id: SingerId): Promise<SingerDetailsResponseDto | null> {
		const cacheKey = `catalog:singer:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<SingerDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.getById(id);
		if (!raw) {
			return null;
		}

		const details = SingerDetailsResponseSchema.parse(serializeResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
