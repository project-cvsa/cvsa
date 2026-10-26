import type { Job } from "bullmq";
import { appLogger } from "@cvsa/logger";
import {
	artistRoleSearchService,
	artistSearchService,
	singerSearchService,
	songSearchService,
} from "../search/container";
import { outboxService } from "./container";
import type { OutboxEntryDto } from "./dto";
import type { OutboxService } from "./service";

export interface OutboxProcessorDeps {
	outboxService: OutboxService;
	searchServices: Record<string, { sync(id: number): Promise<void> }>;
}

export function createOutboxProcessor(
	deps: OutboxProcessorDeps
): (job: Job<OutboxEntryDto>) => Promise<void> {
	// Aggregates without a search index are recorded by the catalog on purpose;
	// they are not an error and must not burn the job's retry budget.
	const reportedUnindexed = new Set<string>();

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
					if (!reportedUnindexed.has(aggregateType)) {
						reportedUnindexed.add(aggregateType);
						appLogger.info(
							`Aggregate type ${aggregateType} has no search index; its outbox events are acknowledged without indexing`,
							{ aggregateType }
						);
					}
					return;
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
