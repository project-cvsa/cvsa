import { randomUUID } from "node:crypto";
import {
	AppError,
	MilestoneRecoveryJobSchema,
	type MilestoneRecoveryJob,
	type MilestoneRecoveryStatus,
} from "@cvsa/contracts";
import type { CrawlerMq } from "../shared/types";
import { RetryLaterError } from "../shared/retryLater";
import type { MilestoneService } from "./service";

export const MILESTONE_QUEUE = "crawler-milestones";

export function createMilestoneMaintenance(mq: CrawlerMq, service: MilestoneService) {
	const queue = mq.createQueue<MilestoneRecoveryJob>(MILESTONE_QUEUE, {
		attempts: 3,
		backoff: { type: "exponential", delay: 1000 },
		removeOnComplete: { age: 86400, count: 100 },
	});
	const worker = mq.createWorker<MilestoneRecoveryJob>(
		MILESTONE_QUEUE,
		async (job) => {
			const result = await service.recover(MilestoneRecoveryJobSchema.parse(job.data));
			await job.updateData?.(result.data);
			await job.updateProgress?.({
				stage: result.done ? "completed" : "evaluating",
				target: result.data.currentAid ?? result.data.afterAid,
				candidates: result.data.processed,
				queued: result.data.inserted,
				updatedAt: new Date().toISOString(),
			});
			if (!result.done) throw new RetryLaterError(1, "local_capacity");
		},
		{ concurrency: 1 }
	);
	return {
		queue,
		worker,
		async enqueue(input: {
			afterAid: string;
			minimumViews: number;
			batchSize: number;
		}): Promise<{ queued: true; jobId: string }> {
			const recoveryId = randomUUID();
			const jobId = `milestones-${recoveryId}`;
			await queue.add(
				"recover",
				MilestoneRecoveryJobSchema.parse({
					...input,
					recoveryId,
					through: new Date().toISOString(),
				}),
				{ jobId }
			);
			return { queued: true, jobId };
		},
		async status(id: string): Promise<MilestoneRecoveryStatus> {
			const job = await queue.getJobDetail(id);
			if (!job) throw new AppError("Recovery job not found", "NOT_FOUND", 404);
			return {
				id,
				state: job.state,
				data: MilestoneRecoveryJobSchema.parse(job.data),
				failedReason: job.failedReason ?? null,
			};
		},
	};
}
