import { AppError, type ActionQueuedResponse } from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { CrawlerQueue } from "../shared/types";
import type { SnapshotBatchJobData } from "../snapshot/worker";
import type { ITrackingRepository } from "./repository.interface";

const LEASE_MS = 5 * 60_000;

export class ManualSnapshotService {
	constructor(
		private readonly tracking: ITrackingRepository,
		private readonly queue: CrawlerQueue<SnapshotBatchJobData>
	) {}

	async enqueue(aid: string): Promise<ActionQueuedResponse> {
		const id = BigInt(aid);
		const existing = await this.tracking.getTracking(id);
		if (!existing) throw new AppError("Video tracking not found", "NOT_FOUND", 404);
		const now = Date.now();
		const claimed = await this.tracking.leaseVideos(
			[id],
			toInstant(new Date(now + LEASE_MS)),
			toInstant(new Date(now))
		);
		if (claimed.length === 0)
			throw new AppError("Video snapshot is already being processed", "ENTITY_CONFLICT", 409);
		try {
			await this.queue.add("process-batch", { aids: [aid] }, { priority: existing.priority });
		} catch (error) {
			await this.tracking.releaseLeases([id]);
			throw error;
		}
		return { queued: true, aid };
	}
}
