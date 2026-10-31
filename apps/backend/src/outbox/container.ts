import { db } from "@cvsa/db";
import { OutboxRepository } from "./repository";
import { OutboxService } from "./service";

export const outboxRepository = new OutboxRepository(db);
export const outboxService = new OutboxService(outboxRepository);
