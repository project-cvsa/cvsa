import { treaty } from "@elysiajs/eden";
import type { EmbeddingApp } from "@embedding-contract";
import { artistReader, artistRoleReader, singerReader, songReader } from "@cvsa/catalog";
import { SongDetailsResponseSchema } from "@cvsa/contracts";
import { serializeResult } from "@cvsa/db";
import { env } from "@cvsa/env";
import {
	ArtistRoleSearchService,
	ArtistSearchService,
	SingerSearchService,
	SongSearchService,
} from "./catalog";
import { SearchManager } from "./manager";

/**
 * The embedding service runs beside the API. Its address is configurable so the
 * same build works when it is reached over a container network or another host
 * instead of the loopback interface.
 */
const embeddingManager = treaty<EmbeddingApp>(env.EMBEDDING_API_URL);

export const searchManager = await SearchManager.create();

export const songSearchService = new SongSearchService(
	{
		async getDetails(id: number) {
			const res = await songReader.getDetails(id);
			if (!res) return null;
			return SongDetailsResponseSchema.parse(serializeResult(res));
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
