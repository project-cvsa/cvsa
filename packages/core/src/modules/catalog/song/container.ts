import { prisma } from "@cvsa/db";
import { SongRepository } from "./repository";
import { SongService } from "./service";
import { SongSearchService, searchManager } from "../../../search";
import { treaty } from "@elysiajs/eden";
import type { EmbeddingApp } from "@cvsa/embedding";
import { outboxService } from "../../outbox/container";

const embeddingManager = treaty<EmbeddingApp>("localhost:14900");

export const songRepository = new SongRepository(prisma);
export const songSearchService = new SongSearchService(
	songRepository,
	searchManager,
	embeddingManager
);
export const songService = new SongService(songRepository, outboxService);
