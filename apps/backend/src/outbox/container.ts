import { prisma } from "@cvsa/db";
import { OutboxRepository } from "./repository";
import { OutboxService } from "./service";

export const outboxRepository = new OutboxRepository(prisma);
export const outboxService = new OutboxService(outboxRepository);
