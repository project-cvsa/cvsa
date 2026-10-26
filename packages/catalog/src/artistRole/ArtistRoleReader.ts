import type { ArtistRole, DatabaseClient } from "@cvsa/db";
import { transformPrismaResult } from "@cvsa/db";
import {
	ArtistRoleDetailsResponseSchema,
	type ArtistRoleDetailsResponseDto,
} from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import type { ArtistRoleId } from "./artistRoleTypes";

export class ArtistRoleReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getById(id: ArtistRoleId): Promise<ArtistRole | null> {
		return this.db.orm.core.ArtistRole.where({ id, deletedAt: null }).first();
	}

	async getDetails(id: ArtistRoleId): Promise<ArtistRoleDetailsResponseDto | null> {
		const cacheKey = `catalog:artistRole:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<ArtistRoleDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.db.orm.core.ArtistRole.where({ id, deletedAt: null }).first();
		if (!raw) {
			return null;
		}

		const details = ArtistRoleDetailsResponseSchema.parse(transformPrismaResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
