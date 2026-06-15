import { prisma } from "@cvsa/db";
import { EngineRepository } from "./repository";
import { EngineService } from "./service";

export const engineRepository = new EngineRepository(prisma);
export const engineService = new EngineService(engineRepository);
