import { type ArtistRole, type DatabaseClient, artistRole, serializeResult } from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
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
		const [row] = await this.db
			.select()
			.from(artistRole)
			.where(and(eq(artistRole.id, id), isNull(artistRole.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async getDetails(id: ArtistRoleId): Promise<ArtistRoleDetailsResponseDto | null> {
		const cacheKey = `catalog:artistRole:details:${id}`;
		if (this.cache) {
			const cached = await this.cache.get<ArtistRoleDetailsResponseDto>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const raw = await this.getById(id);
		if (!raw) {
			return null;
		}

		const details = ArtistRoleDetailsResponseSchema.parse(serializeResult(raw));
		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}
		return details;
	}
}
