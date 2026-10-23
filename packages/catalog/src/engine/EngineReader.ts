import type { DatabaseClient, SvsEngine } from "@cvsa/db";
import { transformPrismaResult } from "@cvsa/db";
import { EngineDetailsResponseSchema, type EngineDetailsResponseDto } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { EngineId } from "./engineTypes";

export class EngineReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: EngineId): Promise<SvsEngine | null> {
		return this.db.orm.core.SvsEngine.where({ id, deletedAt: null }).first();
	}

	async getDetails(id: EngineId): Promise<EngineDetailsResponseDto | null> {
		const cacheKey = `catalog:engine:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<EngineDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.db.orm.core.SvsEngine.where({ id, deletedAt: null }).first();
		if (!raw) {
			return null;
		}

		const details = EngineDetailsResponseSchema.parse(transformPrismaResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
