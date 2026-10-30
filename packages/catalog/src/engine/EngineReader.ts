import { type DatabaseClient, type SvsEngine, serializeResult, svsEngine } from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import { EngineDetailsResponseSchema, type EngineDetailsResponseDto } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { EngineId } from "./engineTypes";

export class EngineReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: EngineId): Promise<SvsEngine | null> {
		const [row] = await this.db
			.select()
			.from(svsEngine)
			.where(and(eq(svsEngine.id, id), isNull(svsEngine.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async getDetails(id: EngineId): Promise<EngineDetailsResponseDto | null> {
		const cacheKey = `catalog:engine:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<EngineDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.getById(id);
		if (!raw) {
			return null;
		}

		const details = EngineDetailsResponseSchema.parse(serializeResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
