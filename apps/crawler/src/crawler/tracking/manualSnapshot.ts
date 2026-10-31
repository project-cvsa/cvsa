import { AppError, type ActionQueuedResponse } from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { CrawlerQueue } from "../shared/types";
import type { SnapshotBatchJobData } from "../snapshot/worker";
import type { ITrackingRepository } from "./repository.interface";

const LEASE_MS = 5 * 60_000;

export interface EnqueueSnapshotOptions {
	force?: boolean;
}

export class ManualSnapshotService {
	constructor(
		private readonly tracking: ITrackingRepository,
		private readonly queue: CrawlerQueue<SnapshotBatchJobData>,
		private readonly metadata?: { getMetadata(aid: bigint): Promise<unknown> }
	) {}

	async enqueue(
		aid: string,
		options: EnqueueSnapshotOptions = {}
	): Promise<ActionQueuedResponse> {
		const id = BigInt(aid);
		let existing = await this.tracking.getTracking(id);
		const now = Date.now();

		if (!existing) {
			if (this.metadata) {
				const meta = await this.metadata.getMetadata(id);
				if (meta) {
					existing = await this.tracking.upsertTracking({
						aid: id,
						state: "regular",
						priority: 1,
						nextSnapshotAt: toInstant(new Date(now)),
					});
				}
			}
			if (!existing) {
				throw new AppError("Video tracking not found", "NOT_FOUND", 404);
			}
		}

		if (options.force) {
			await this.tracking.releaseLeases([id]);
		}

		const claimed = await this.tracking.leaseVideos(
			[id],
			toInstant(new Date(now + LEASE_MS)),
			toInstant(new Date(now))
		);
		if (claimed.length === 0)
			throw new AppError("Video snapshot is already being processed", "ENTITY_CONFLICT", 409);
		try {
			await this.queue.add("process-batch", { aids: [aid] }, { priority: 1 });
		} catch (error) {
			await this.tracking.releaseLeases([id]);
			throw error;
		}
		return { queued: true, aid };
	}
}
