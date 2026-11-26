import {
	AppError,
	DiscoveryJobProgressSchema,
	DiscoveryTaskDescriptionSchema,
	type DatasetExportItem,
	type DiscoveryStatusDto,
	type DiscoverySampleListQuery,
	type DiscoverySampleListResponse,
	type MetadataBackfillResponse,
	type VideoAnnotationDto,
	type VideoCurationDto,
} from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type { ITrackingRepository } from "../tracking/repository.interface";
import type { CrawlerQueue, CrawlerQueueJobSnapshot } from "../shared/types";
import type { CrawlerStatsCollector } from "../stats/collector";
import type { BilibiliClient } from "../bilibili/client";
import { withBilibiliPurpose } from "../bilibili/requestContext";
import type { IDiscoveryRepository } from "./repository.interface";
import type { DiscoveryJobData } from "./worker";
import { toMetadataInput } from "./metadata";
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
		private readonly tracking: ITrackingRepository,
		private readonly bilibiliClient?: BilibiliClient
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
		humanLabel: 0 | 1 | null,
		options?: {
			userId?: string;
			decision?: "accepted" | "rejected" | "uncertain";
			tags?: string[];
			notes?: string;
		}
	) {
		const userId = options?.userId ?? "admin";
		const decision = options?.decision ?? (humanLabel === 1 ? "accepted" : "rejected");

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

		// Apply curation ("uncertain" marks curation pending without labeling rejected or deleting tracking)
		const curationStatus = decision === "uncertain" ? "pending" : decision;
		const curation = await this.curate(aid, userId, curationStatus, options?.notes);
		const [updatedSample, metadata, annotationCounts] = await Promise.all([
			this.repository.getSample(aid),
			this.repository.getMetadataSummaries([aid]),
			this.repository.getAnnotationCounts([aid]),
		]);
		return toSampleItem(
			updatedSample ?? sample,
			metadata[0]?.pic ?? null,
			{
				aid,
				bvid: sample.bvid,
				status: curation.status,
				curatedBy: curation.curatedBy,
				reason: curation.reason ?? null,
				curatedAt: toInstant(new Date(curation.curatedAt)),
				updatedAt: toInstant(new Date(curation.updatedAt)),
			},
			annotationCounts.get(aid) ?? 0
		);
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

	/**
	 * Backfill rich video details for tracked videos or accepted discovery samples
	 * that are missing complete metadata (cid, duration, tags, description, etc.).
	 */
	async backfillMetadata(options?: {
		aids?: bigint[];
		limit?: number;
	}): Promise<MetadataBackfillResponse> {
		if (!this.bilibiliClient) {
			throw new AppError(
				"Bilibili client is not configured for backfill",
				"UPSTREAM_ERROR",
				503
			);
		}
		const client = this.bilibiliClient;

		let targetAids: bigint[] = options?.aids ?? [];
		if (targetAids.length === 0) {
			targetAids = await this.repository.listIncompleteMetadataAids(options?.limit ?? 25);
		}

		let succeeded = 0;
		let failed = 0;
		const results: Array<{ aid: string; success: boolean; error?: string }> = [];

		for (const aid of targetAids) {
			try {
				const details = await withBilibiliPurpose("tracking", () =>
					client.getVideoDetails(aid)
				);
				await this.repository.upsertMetadata(toMetadataInput(aid, details));

				// If tracked, refresh nextMetadataAt
				const tracking = await this.tracking.getTracking(aid);
				if (tracking) {
					await this.tracking.updateSchedule(aid, {
						nextMetadataAt: toInstant(new Date(Date.now() + 7 * 86_400_000)),
						lastError: null,
					});
				}

				succeeded++;
				results.push({ aid: aid.toString(), success: true });
			} catch (error) {
				failed++;
				const message = error instanceof Error ? error.message : String(error);
				results.push({ aid: aid.toString(), success: false, error: message });
			}
		}

		return {
			requested: targetAids.length,
			processed: succeeded + failed,
			succeeded,
			failed,
			results,
		};
	}

	/**
	 * Export curated and labeled discovery samples as a machine-learning training dataset.
	 */
	async exportDataset(options?: {
		format?: "jsonl" | "json";
		minProbability?: number;
		status?: "all" | "accepted" | "rejected";
	}): Promise<{
		items: DatasetExportItem[];
		formatted: string;
		mimeType: string;
		filename: string;
	}> {
		const format = options?.format ?? "jsonl";
		const statusFilter = options?.status ?? "all";
		const minProb = options?.minProbability ?? 0;

		const batchSize = 500;
		const samples = [];
		for (let offset = 0; ; offset += batchSize) {
			const page = await this.repository.listSamples({
				limit: batchSize,
				offset,
				sortBy: "aid",
				sortOrder: "asc",
			});
			samples.push(...page);
			if (page.length < batchSize) break;
		}
		const aids = samples.map((s) => s.aid);
		const [curationMap, metadatas] = await Promise.all([
			this.repository.getCurations(aids),
			this.repository.getMetadatas(aids),
		]);

		const metadataMap = new Map(metadatas.map((m) => [m.aid, m]));

		const exportItems: DatasetExportItem[] = [];

		for (const sample of samples) {
			const curation = curationMap.get(sample.aid);
			const meta = metadataMap.get(sample.aid);

			let label: 0 | 1 | null = null;
			if (curation?.status === "accepted" || sample.humanLabel === 1) {
				label = 1;
			} else if (curation?.status === "rejected" || sample.humanLabel === 0) {
				label = 0;
			}

			if (label === null) continue;
			if (statusFilter === "accepted" && label !== 1) continue;
			if (statusFilter === "rejected" && label !== 0) continue;
			if (sample.songProbability < minProb) continue;

			const annotations = await this.repository.listAnnotations(sample.aid);
			const toStrArray = (val: unknown): string[] =>
				Array.isArray(val) ? val.filter((i): i is string => typeof i === "string") : [];
			const sampleTags = toStrArray(sample.tags);
			const metaTags = toStrArray(meta?.tags);

			exportItems.push({
				aid: sample.aid.toString(),
				bvid: sample.bvid,
				title: sample.title,
				description: sample.description ?? meta?.description ?? null,
				tags: sampleTags.length > 0 ? sampleTags : metaTags,
				duration: meta?.duration ?? 0,
				ownerName: meta?.ownerName ?? null,
				pubdate: meta?.pubdate ? meta.pubdate.toString() : null,
				label,
				curationStatus: (curation?.status as "accepted" | "pending" | "rejected") ?? null,
				decisionReason: sample.decision,
				songProbability: sample.songProbability,
				annotations: annotations.map((a) => ({
					userId: a.userId,
					decision: a.decision,
					tags: a.tags ?? undefined,
					notes: a.notes ?? undefined,
				})),
			});
		}

		const timestamp = new Date().toISOString().slice(0, 10);
		if (format === "json") {
			return {
				items: exportItems,
				formatted: JSON.stringify(exportItems, null, 2),
				mimeType: "application/json",
				filename: `cvsa-classifier-dataset-${timestamp}.json`,
			};
		}

		const jsonl = exportItems.map((item) => JSON.stringify(item)).join("\n");
		return {
			items: exportItems,
			formatted: jsonl,
			mimeType: "application/x-ndjson",
			filename: `cvsa-classifier-dataset-${timestamp}.jsonl`,
		};
	}
}
