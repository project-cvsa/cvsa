import { appLogger } from "@cvsa/logger";
import { AppError } from "@cvsa/contracts";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { CrawlerMq, CrawlerWorker } from "../shared/types";
import type { SnapshotService } from "./service";

export const SNAPSHOT_BATCH_QUEUE = "snapshot-batch";
const THROTTLE_RETRY_DELAY_MS = 60_000;

export function snapshotFailureKind(error: unknown): "rate_limit" | "unavailable" | "other" {
	if (AppError.isAppError(error) && error.code === "NO_AVAILABLE_ADAPTER") return "unavailable";
	if (
		error instanceof Error &&
		/Bilibili request failed with HTTP (412|429)\b/.test(error.message)
	)
		return "rate_limit";
	return "other";
}

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
				const failureKind = snapshotFailureKind(error);
				if (failureKind !== "other") {
					await snapshotService.deferLeases(aids, THROTTLE_RETRY_DELAY_MS, failureKind);
					if (failureKind === "unavailable") stats.recordError("adapterUnavailable");
					appLogger.warn(
						"Snapshot batch deferred after throttling or unavailable exits",
						{
							component: "snapshot-worker",
							jobId: job.id,
							error,
						}
					);
					return;
				}
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
