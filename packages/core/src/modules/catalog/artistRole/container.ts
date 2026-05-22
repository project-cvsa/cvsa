import { prisma } from "@cvsa/db";
import { ArtistRoleRepository } from "./repository";
import { ArtistRoleService } from "./service";
import { ArtistRoleSearchService, searchManager } from "../../../search";
import { treaty } from "@elysiajs/eden";
import type { EmbeddingApp } from "@cvsa/embedding";
import { outboxService } from "../../outbox/container";

const embeddingManager = treaty<EmbeddingApp>("localhost:14900");

export const artistRoleRepository = new ArtistRoleRepository(prisma);
export const artistRoleSearchService = new ArtistRoleSearchService(
	artistRoleRepository,
	searchManager,
	embeddingManager
);
export const artistRoleService = new ArtistRoleService(artistRoleRepository, outboxService);
