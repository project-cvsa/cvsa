import { prisma } from "@cvsa/db";
import { SingerRepository } from "./repository";
import { SingerService } from "./service";
import { SingerSearchService, searchManager } from "../../../search";
import { treaty } from "@elysiajs/eden";
import type { EmbeddingApp } from "@cvsa/embedding";
import { outboxService } from "../../outbox/container";

const embeddingManager = treaty<EmbeddingApp>("localhost:14900");

export const singerRepository = new SingerRepository(prisma);
export const singerSearchService = new SingerSearchService(
	singerRepository,
	searchManager,
	embeddingManager
);
export const singerService = new SingerService(singerRepository, outboxService);
