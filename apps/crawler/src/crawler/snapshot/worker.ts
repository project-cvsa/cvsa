import { RetryLaterError } from "../shared/retryLater";
import { appLogger } from "@cvsa/logger";
import { AppError } from "@cvsa/contracts";
import { createNoopStatsRecorder, type StatsDeferral, type StatsRecorder } from "../stats/types";
import { outcomeOfError } from "../stats/outcome";
import type { CrawlerMq, CrawlerWorker } from "../shared/types";
import type { SnapshotService } from "./service";

export const SNAPSHOT_BATCH_QUEUE = "snapshot-batch";

export function snapshotFailureKind(
	error: unknown
): "rate_limit" | "unavailable" | "local_capacity" | "other" {
	if (error instanceof RetryLaterError)
		return error.reason === "local_capacity"
			? "local_capacity"
			: error.reason === "upstream"
				? "rate_limit"
				: error.reason === "network_recovery"
					? "unavailable"
					: "other";
	if (AppError.isAppError(error) && error.code === "NO_AVAILABLE_ADAPTER") return "unavailable";
	if (
		error instanceof Error &&
		/Bilibili request failed with HTTP (412|429)\b/.test(error.message)
	)
		return "rate_limit";
	return "other";
}

function deferralFor(
	kind: ReturnType<typeof snapshotFailureKind>,
	requestedMs: number
): StatsDeferral {
	const reason =
		kind === "unavailable"
			? "egress_unavailable"
			: kind === "local_capacity"
				? "local_budget"
				: kind === "other"
					? "task_retry"
					: "upstream_throttle";
	return { reason, requestedMs };
}

export interface SnapshotBatchJobData {
	aids: Array<number | string>;
	leaseUntil?: string;
	dueAt?: string;
	deadlineAt?: string;
	missedDeadline?: boolean;
	priority?: number;
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
			const noteLateness = async () => {
				if (
					job.data.deadlineAt &&
					Date.now() > Date.parse(job.data.deadlineAt) &&
					!job.data.missedDeadline
				) {
					job.data = { ...job.data, missedDeadline: true };
					await job.updateData?.(job.data);
					stats.record("trackingLateExecutions");
					appLogger.warn(
						"Tracking collection exceeded its allowed lateness; continuing at the same priority",
						{
							component: "snapshot-worker",
							jobId: job.id,
							dueAt: job.data.dueAt,
							deadlineAt: job.data.deadlineAt,
							priority: job.data.priority,
						}
					);
				}
			};
			await noteLateness();

			appLogger.debug("Processing snapshot batch", {
				component: "snapshot-worker",
				jobId: job.id,
				count: aids.length,
			});

			let scheduledRetry = false;
			const startedAt = performance.now();
			if (job.enqueuedAt !== undefined)
				stats.recordQueueWait(
					Math.max(0, (job.startedAt ?? Date.now()) - job.enqueuedAt - (job.delayMs ?? 0))
				);
			stats.recordJobStarted("tracking");
			try {
				const result = await snapshotService.processBatch(
					aids,
					job.data.leaseUntil,
					job.data.dueAt
				);
				await noteLateness();
				const pending =
					result.status === "api_error" ? aids.map(String) : (result.retryAids ?? []);
				if (pending.length > 0) {
					const retry = await snapshotService.retryBatch(
						pending,
						undefined,
						result.status === "api_error"
							? `bilibili_api_error:${result.code}`
							: "video_missing_from_stats_response",
						job.data.leaseUntil
					);
					await job.updateData?.({
						...job.data,
						aids: retry.aids,
						leaseUntil: retry.leaseUntil,
					});
					if (retry.aids.length > 0) {
						scheduledRetry = true;
						stats.recordDeferral({ reason: "task_retry", requestedMs: retry.delayMs });
						throw new RetryLaterError(retry.delayMs, "task_retry");
					}
				}
				if (result.status === "success" && result.inserted === 0)
					stats.record("executionsWithoutOutput");
				stats.recordJobOutcome("tracking", "success", performance.now() - startedAt);
			} catch (error) {
				if (error instanceof RetryLaterError && scheduledRetry) {
					stats.recordJobOutcome("tracking", "deferred", performance.now() - startedAt);
					throw error;
				}
				const kind = snapshotFailureKind(error);
				const retry = await snapshotService.retryBatch(
					aids,
					error instanceof RetryLaterError ? error.delayMs : undefined,
					kind === "local_capacity"
						? "local_capacity"
						: error instanceof Error
							? error.message
							: String(error),
					job.data.leaseUntil
				);
				await job.updateData?.({
					...job.data,
					aids: retry.aids,
					leaseUntil: retry.leaseUntil,
				});
				stats.recordJobOutcome(
					"tracking",
					outcomeOfError(error) === "cancelled" ? "cancelled" : "deferred",
					performance.now() - startedAt
				);
				stats.recordDeferral(deferralFor(kind, retry.delayMs));
				if (retry.aids.length > 0)
					throw new RetryLaterError(
						retry.delayMs,
						error instanceof RetryLaterError ? error.reason : "task_retry"
					);
			}
		},
		{
			concurrency: 25,
			async onDeadline(job) {
				const retry = await snapshotService.retryBatch(
					job.data.aids,
					undefined,
					"task:deadline_exceeded",
					job.data.leaseUntil
				);
				await job.updateData?.({
					...job.data,
					aids: retry.aids,
					leaseUntil: retry.leaseUntil,
				});
			},
		}
	);
}
