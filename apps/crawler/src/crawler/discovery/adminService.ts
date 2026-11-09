import {
	AppError,
	DiscoveryJobProgressSchema,
	DiscoveryTaskDescriptionSchema,
	type DiscoveryStatusDto,
	type DiscoverySampleListQuery,
	type DiscoverySampleListResponse,
	type VideoAnnotationDto,
	type VideoCurationDto,
} from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { ITrackingRepository } from "../tracking/repository.interface";
import type { CrawlerQueue, CrawlerQueueJobSnapshot } from "../shared/types";
import type { CrawlerStatsCollector } from "../stats/collector";
import type { IDiscoveryRepository } from "./repository.interface";
import type { DiscoveryJobData } from "./worker";
import { toAnnotationItem, toCurationItem, toSampleItem } from "./sampleDto";

function isSubtask(job: CrawlerQueueJobSnapshot): boolean {
	if (job.name.startsWith("detail-") || job.name.startsWith("active-")) return true;
	const task = DiscoveryTaskDescriptionSchema.safeParse(job.data);
	return (
		task.success &&
		(task.data.type === "fetch-video-details" || task.data.type === "active-discovery")
	);
}

function activity(job: CrawlerQueueJobSnapshot): DiscoveryStatusDto["activeJobs"][number] {
	const progress = DiscoveryJobProgressSchema.safeParse(job.progress);
	const task = DiscoveryTaskDescriptionSchema.safeParse(job.data);
	const data = job.data;
	const target =
		typeof data === "object" && data !== null && "aid" in data ? String(data.aid) : null;
	return {
		id: job.id,
		name: job.name,
		state: job.state,
		task: task.success ? task.data : null,
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
			candidatesPerMin: await this.candidatesPerMin(),
		};
	}

	private async candidatesPerMin(): Promise<number> {
		const report = await this.stats.getReport("5m");
		const seconds = Math.max(1, (report.to - report.from) / 1000);
		return (report.minutes.counters.candidatesFinished * 60) / seconds;
	}

	async annotate(
		aid: bigint,
		userId: string,
		input: {
			decision: "accepted" | "rejected" | "uncertain";
			tags?: string[];
			notes?: string;
		}
	): Promise<VideoAnnotationDto> {
		const sample = await this.repository.getSample(aid);
		if (!sample) throw new AppError("Discovery sample not found", "NOT_FOUND", 404);
		const annotation = await this.repository.addAnnotation({
			aid,
			bvid: sample.bvid,
			userId,
			decision: input.decision,
			tags: input.tags,
			notes: input.notes,
		});
		return toAnnotationItem(annotation);
	}

	async listAnnotations(aid: bigint): Promise<VideoAnnotationDto[]> {
		const annotations = await this.repository.listAnnotations(aid);
		return annotations.map(toAnnotationItem);
	}

	async curate(
		aid: bigint,
		curatedBy: string,
		status: "accepted" | "rejected" | "pending",
		reason?: string
	): Promise<VideoCurationDto> {
		const sample = await this.repository.getSample(aid);
		if (!sample) throw new AppError("Discovery sample not found", "NOT_FOUND", 404);
		const curation = await this.repository.upsertCuration({
			aid,
			bvid: sample.bvid,
			status,
			curatedBy,
			reason,
		});

		if (status === "accepted") {
			await this.repository.labelSample(aid, 1);
			if (!(await this.tracking.getTracking(aid))) {
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
		} else if (status === "rejected") {
			await this.repository.labelSample(aid, 0);
			await this.tracking.deleteTracking(aid);
		}

		return toCurationItem(curation);
	}

	async label(
		aid: bigint,
		humanLabel: 0 | 1,
		options?: { userId?: string; tags?: string[]; notes?: string }
	) {
		const userId = options?.userId ?? "admin";
		const decision = humanLabel === 1 ? "accepted" : "rejected";

		// Record annotation
		const sample = await this.repository.getSample(aid);
		if (!sample) throw new AppError("Discovery sample not found", "NOT_FOUND", 404);
		await this.repository.addAnnotation({
			aid,
			bvid: sample.bvid,
			userId,
			decision,
			tags: options?.tags,
			notes: options?.notes,
		});

		// Apply curation
		const curation = await this.curate(aid, userId, decision, options?.notes);
		const updatedSample = await this.repository.getSample(aid);
		return toSampleItem(updatedSample ?? sample, null, {
			aid,
			bvid: sample.bvid,
			status: curation.status,
			curatedBy: curation.curatedBy,
			reason: curation.reason ?? null,
			curatedAt: toInstant(new Date(curation.curatedAt)),
			updatedAt: toInstant(new Date(curation.updatedAt)),
		});
	}

	/**
	 * Human rejection is the permanent exclusion: the sample is labelled `0`
	 * before the tracking row is removed, so a queued discovery job cannot add
	 * the video back. A missing sample is a 404 rather than a silent synthetic
	 * row, mirroring {@link label}.
	 */
	async untrack(aid: bigint, userId = "admin"): Promise<void> {
		if (!(await this.tracking.getTracking(aid))) {
			throw new AppError("Video tracking not found", "NOT_FOUND", 404);
		}
		await this.label(aid, 0, { userId, notes: "untracked via admin console" });
	}

	async listSamples(query: DiscoverySampleListQuery): Promise<DiscoverySampleListResponse> {
		const [rows, total] = await Promise.all([
			this.repository.listSamples(query),
			this.repository.countSamples(query),
		]);
		const aids = rows.map((row) => row.aid);
		const [metadata, curations, annotationCounts] = await Promise.all([
			this.repository.getMetadataSummaries(aids),
			this.repository.getCurations(aids),
			this.repository.getAnnotationCounts(aids),
		]);
		const pictures = new Map(metadata.map((row) => [row.aid, row.pic]));
		return {
			items: rows.map((row) =>
				toSampleItem(
					row,
					pictures.get(row.aid),
					curations.get(row.aid),
					annotationCounts.get(row.aid)
				)
			),
			total,
		};
	}
}
