import {
	AppError,
	DiscoveryJobProgressSchema,
	type DiscoveryStatusDto,
	type DiscoverySampleListQuery,
	type DiscoverySampleListResponse,
} from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { ITrackingRepository } from "../tracking/repository.interface";
import type { CrawlerQueue, CrawlerQueueJobSnapshot } from "../shared/types";
import type { CrawlerStatsCollector } from "../stats/collector";
import type { IDiscoveryRepository } from "./repository.interface";
import type { DiscoveryJobData } from "./worker";
import { toSampleItem } from "./sampleDto";

function isSubtask(job: CrawlerQueueJobSnapshot): boolean {
	if (job.name.startsWith("detail-") || job.name.startsWith("active-")) return true;
	const data = job.data as Record<string, unknown> | null;
	return data?.type === "fetch-video-details" || data?.type === "active-discovery";
}

function activity(job: CrawlerQueueJobSnapshot): DiscoveryStatusDto["activeJobs"][number] {
	const progress = DiscoveryJobProgressSchema.safeParse(job.progress);
	const data = job.data;
	const target =
		typeof data === "object" && data !== null && "aid" in data ? String(data.aid) : null;
	return {
		id: job.id,
		name: job.name,
		state: job.state,
		target: progress.success ? progress.data.target : target,
		timestamp: job.timestamp,
		processedOn: job.processedOn ?? null,
		finishedOn: job.finishedOn ?? null,
		failedReason: job.failedReason ?? null,
		progress: progress.success ? progress.data : null,
	};
}

export class DiscoveryAdminService {
	constructor(
		private readonly queue: CrawlerQueue<DiscoveryJobData>,
		private readonly repository: IDiscoveryRepository,
		private readonly stats: CrawlerStatsCollector,
		private readonly tracking: ITrackingRepository
	) {}

	async getStatus(): Promise<DiscoveryStatusDto> {
		const [counts, active, recent] = await Promise.all([
			this.queue.getJobCounts(),
			this.queue.getJobs(["active"], 50),
			this.queue.getJobs(["completed", "failed"], 100),
		]);
		const oldest =
			counts.waiting > 0 ? await this.queue.getJobs(["waiting"], 1, counts.waiting - 1) : [];

		const filteredActive = active.filter((j) => !isSubtask(j));
		const filteredRecent = recent.filter((j) => !isSubtask(j)).slice(0, 20);

		return {
			active: filteredActive.length > 0 || (active.length > 0 && counts.active > 0),
			counts: {
				waiting: counts.waiting,
				active: counts.active,
				delayed: counts.delayed,
				failed: counts.failed,
				oldestWaitSec: oldest[0]
					? Math.max(0, (Date.now() - oldest[0].timestamp) / 1000)
					: 0,
			},
			activeJobs: (filteredActive.length > 0 ? filteredActive : active).map(activity),
			recentJobs: (filteredRecent.length > 0 ? filteredRecent : recent)
				.sort((a, b) => (b.finishedOn ?? b.timestamp) - (a.finishedOn ?? a.timestamp))
				.map(activity),
			candidatesPerMin: this.stats.getWindow("5m").counters.candidatesScanned / 5,
		};
	}

	async label(aid: bigint, humanLabel: 0 | 1) {
		const sample = await this.repository.labelSample(aid, humanLabel);
		if (!sample) throw new AppError("Discovery sample not found", "NOT_FOUND", 404);
		if (humanLabel === 0) await this.tracking.deleteTracking(aid);
		else if (!(await this.tracking.getTracking(aid))) {
			const metadata = await this.repository.getMetadata(aid);
			await this.tracking.upsertTracking({
				aid,
				state: "new",
				nextSnapshotAt: toInstant(new Date()),
				publishedAt: metadata?.pubdate ?? null,
				priority: 2,
				scheduleReason: "initial",
				lastError: null,
			});
		}
		return toSampleItem(sample);
	}

	/**
	 * Human rejection is the permanent exclusion: the sample is labelled `0`
	 * before the tracking row is removed, so a queued discovery job cannot add
	 * the video back. A missing sample is a 404 rather than a silent synthetic
	 * row, mirroring {@link label}.
	 */
	async untrack(aid: bigint): Promise<void> {
		if (!(await this.tracking.getTracking(aid))) {
			throw new AppError("Video tracking not found", "NOT_FOUND", 404);
		}
		await this.label(aid, 0);
	}

	async listSamples(query: DiscoverySampleListQuery): Promise<DiscoverySampleListResponse> {
		const [rows, total] = await Promise.all([
			this.repository.listSamples(query),
			this.repository.countSamples(query),
		]);
		const metadata = await this.repository.getMetadatas(rows.map((row) => row.aid));
		const pictures = new Map(metadata.map((row) => [row.aid, row.pic]));
		return { items: rows.map((row) => toSampleItem(row, pictures.get(row.aid))), total };
	}
}
