import { appLogger } from "@cvsa/logger";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { CrawlerMq, CrawlerWorker } from "../shared/types";
import type { SnapshotService } from "./service";

export const SNAPSHOT_BATCH_QUEUE = "snapshot-batch";

export interface SnapshotBatchJobData {
	aids: Array<number | string>;
}

export function createSnapshotBatchWorker(
	mq: CrawlerMq,
	snapshotService: SnapshotService,
	stats: StatsRecorder = createNoopStatsRecorder()
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

			const startedAt = performance.now();
			try {
				const result = await snapshotService.processBatch(aids);
				if (result.status === "api_error") {
					appLogger.warn("Snapshot batch encountered API error", {
						component: "snapshot-worker",
						jobId: job.id,
						code: result.code,
					});
					return;
				}

				appLogger.info("Snapshot batch completed successfully", {
					component: "snapshot-worker",
					jobId: job.id,
					inserted: result.inserted,
					missing: result.missingCount,
				});
			} catch (error) {
				// Nothing was scheduled, so the lease has to go back immediately
				// instead of blackholing these videos until it expires.
				await snapshotService.releaseLeases(aids).catch((leaseError) => {
					appLogger.warn("Failed to release snapshot batch leases", {
						component: "snapshot-worker",
						jobId: job.id,
						error: leaseError,
					});
				});
				stats.recordError("other");
				throw error;
			} finally {
				stats.recordJobCompleted();
				stats.recordTask(performance.now() - startedAt);
			}
		},
		{
			concurrency: 5,
		}
	);
}
