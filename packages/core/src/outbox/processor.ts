import type { Job } from "bullmq";
import type { OutboxEntryDto, OutboxService } from "@cvsa/core/internal";
import {
	songSearchService,
	artistSearchService,
	singerSearchService,
	artistRoleSearchService,
} from "@cvsa/core/internal";
import { outboxService } from "../modules/outbox/container";
import { appLogger } from "@cvsa/logger";

export interface OutboxProcessorDeps {
	outboxService: OutboxService;
	searchServices: Record<string, { sync(id: number): Promise<void> }>;
}

export function createOutboxProcessor(
	deps: OutboxProcessorDeps
): (job: Job<OutboxEntryDto>) => Promise<void> {
	return async function processOutboxEntry(job: Job<OutboxEntryDto>): Promise<void> {
		const entry = job.data;

		await deps.outboxService.processEntry(
			entry.id,
			async (aggregateType, aggregateId, eventType) => {
				appLogger.debug(
					`processing outbox entry with ID ${aggregateId}, type ${aggregateType}`,
					{
						aggregateId,
						aggregateType,
						eventType,
					}
				);

				const searchService = deps.searchServices[aggregateType];
				if (!searchService) {
					appLogger.warn(`Unknown aggregate type: ${aggregateType}`);
					throw new Error(`Unknown aggregate type: ${aggregateType}`);
				}

				await searchService.sync(aggregateId);
			}
		);
	};
}

export const processOutboxEntry = createOutboxProcessor({
	outboxService,
	searchServices: {
		song: songSearchService,
		artist: artistSearchService,
		singer: singerSearchService,
		artistRole: artistRoleSearchService,
	},
});
