import { prisma } from "@cvsa/db";
import { ArtistRepository } from "./repository";
import { ArtistService } from "./service";
import { ArtistSearchService, searchManager } from "../../../search";
import { treaty } from "@elysiajs/eden";
import type { EmbeddingApp } from "@cvsa/embedding";
import { outboxService } from "../../outbox/container";

const embeddingManager = treaty<EmbeddingApp>("localhost:14900");

export const artistRepository = new ArtistRepository(prisma);
export const artistSearchService = new ArtistSearchService(
	artistRepository,
	searchManager,
	embeddingManager
);
export const artistService = new ArtistService(artistRepository, outboxService);
