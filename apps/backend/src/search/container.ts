import { treaty } from "@elysiajs/eden";
import type { EmbeddingApp } from "@cvsa/embedding";
import { artistReader, artistRoleReader, singerReader, songReader } from "@cvsa/catalog";
import { SongDetailsResponseSchema } from "@cvsa/contracts";
import { transformPrismaResult } from "@cvsa/db";
import {
	ArtistRoleSearchService,
	ArtistSearchService,
	SingerSearchService,
	SongSearchService,
} from "./catalog";
import { SearchManager } from "./manager";

const embeddingManager = treaty<EmbeddingApp>("localhost:14900");

export const searchManager = await SearchManager.create();

export const songSearchService = new SongSearchService(
	{
		async getDetails(id: number) {
			const res = await songReader.getDetails(id);
			if (!res) return null;
			return SongDetailsResponseSchema.parse(transformPrismaResult(res));
		},
	},
	searchManager,
	embeddingManager
);

export const artistSearchService = new ArtistSearchService(
	artistReader,
	searchManager,
	embeddingManager
);

export const singerSearchService = new SingerSearchService(
	singerReader,
	searchManager,
	embeddingManager
);

export const artistRoleSearchService = new ArtistRoleSearchService(
	artistRoleReader,
	searchManager,
	embeddingManager
);
