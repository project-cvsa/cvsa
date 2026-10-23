import { appLogger } from "@cvsa/logger";
import type { CrawlerMq, CrawlerWorker } from "../shared/types";
import type { SnapshotService } from "./service";

export const SNAPSHOT_BATCH_QUEUE = "snapshot-batch";

export interface SnapshotBatchJobData {
	aids: Array<number | string>;
}

export function createSnapshotBatchWorker(
	mq: CrawlerMq,
	snapshotService: SnapshotService
): CrawlerWorker {
	return mq.createWorker<SnapshotBatchJobData>(
		SNAPSHOT_BATCH_QUEUE,
		async (job) => {
			const aids = job.data.aids;
			if (!aids || aids.length === 0) return;

			appLogger.debug("Processing snapshot batch", {
				component: "snapshot-worker",
				jobId: job.id,
				count: aids.length,
			});

			const result = await snapshotService.processBatch(aids);
			if (result.status === "api_error") {
				appLogger.warn("Snapshot batch encountered API error", {
					component: "snapshot-worker",
					jobId: job.id,
					code: result.code,
				});
			} else {
				appLogger.info("Snapshot batch completed successfully", {
					component: "snapshot-worker",
					jobId: job.id,
					inserted: result.inserted,
					missing: result.missingCount,
				});
			}
		},
		{
			concurrency: 5,
		}
	);
}
