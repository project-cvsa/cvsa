import { appLogger } from "@cvsa/logger";
import { toInstant, type Temporal, type VideoTracking } from "@cvsa/snapshot-db";
import {
	computeNextMetadataAt,
	fromDetailTags,
	type BilibiliClient,
	type IDiscoveryRepository,
	type ITrackingRepository,
	type TrackingState,
	type UpsertMetadataInput,
	type VideoDetailsData,
} from "../crawler";

export interface MetadataRefreshSchedulerDeps {
	/** Tracking rows whose `nextMetadataAt` has elapsed. */
	listDueMetadata(now: Temporal.Instant, limit: number): Promise<VideoTracking[]>;
	trackingRepository: Pick<ITrackingRepository, "updateSchedule">;
	discoveryRepository: Pick<IDiscoveryRepository, "upsertMetadata">;
	bilibiliClient: Pick<BilibiliClient, "getVideoDetails">;
}

export interface MetadataRefreshSchedulerOptions {
	/** How often the due queue is drained. */
	intervalMs?: number;
	/** Maximum refreshes per tick, so a backlog cannot monopolise the API budget. */
	batchSize?: number;
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 25;

function toTrackingState(value: string): TrackingState {
	switch (value) {
		case "new":
		case "milestone":
		case "archive":
			return value;
		default:
			return "regular";
	}
}

function toMetadataInput(aid: bigint, details: VideoDetailsData): UpsertMetadataInput {
	const view = details.View;
	const card = details.Card;
	const tags = details.Tags ?? [];
	const now = toInstant(new Date());

	return {
		aid,
		bvid: view.bvid,
		cid: view.cid ? BigInt(view.cid) : null,
		videos: view.videos ?? 1,
		tid: view.tid ?? null,
		tidV2: view.tid_v2 ?? null,
		tname: view.tname ?? null,
		tnameV2: view.tname_v2 ?? null,
		copyright: view.copyright ?? null,
		pic: view.pic ?? null,
		title: view.title,
		pubdate: view.pubdate ? toInstant(new Date(view.pubdate * 1_000)) : null,
		ctime: view.ctime ? toInstant(new Date(view.ctime * 1_000)) : null,
		description: view.desc ?? null,
		descV2: view.desc_v2 ?? null,
		state: view.state ?? 0,
		duration: view.duration ?? 0,
		Dynamic: view.dynamic ?? null,
		dimension: view.dimension ?? null,
		mid: view.owner?.mid ? BigInt(view.owner.mid) : null,
		ownerName: view.owner?.name ?? card?.card?.name ?? null,
		ownerFace: view.owner?.face ?? card?.card?.face ?? null,
		pages: view.pages ?? null,
		staff: view.staff ?? null,
		rights: view.rights ?? null,
		honorReply: view.honor_reply ?? null,
		tags: fromDetailTags(tags),
		videoStatus: "normal",
		discoverySource: "manual",
		capturedAt: now,
	};
}

/**
 * Drains `video_tracking.next_metadata_at`.
 *
 * Snapshot sampling only books the next full-metadata refresh; without a
 * consumer the column would grow stale forever. This scheduler fetches the
 * detail payload for each due row, upserts the metadata, and advances the
 * deadline (or records the failure and retries on the same cadence).
 */
export class MetadataRefreshScheduler {
	private timer: ReturnType<typeof setInterval> | undefined;
	private running = false;
	private readonly intervalMs: number;
	private readonly batchSize: number;

	constructor(
		private readonly deps: MetadataRefreshSchedulerDeps,
		options: MetadataRefreshSchedulerOptions = {}
	) {
		this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
	}

	start(intervalMs = this.intervalMs): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			void this.refreshDue().catch((error) => {
				appLogger.warn("Periodic metadata refresh failed", {
					component: "metadata-refresh",
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, intervalMs);
		appLogger.info("Metadata refresh scheduler started", {
			component: "metadata-refresh",
			intervalMs,
		});
	}

	stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
		appLogger.info("Metadata refresh scheduler stopped", { component: "metadata-refresh" });
	}

	/** Refresh every due row up to the batch size, returning how many succeeded. */
	async refreshDue(now: Temporal.Instant = toInstant(new Date())): Promise<number> {
		if (this.running) return 0;
		this.running = true;
		try {
			const due = await this.deps.listDueMetadata(now, this.batchSize);
			let refreshed = 0;
			for (const tracking of due) {
				if (await this.refreshOne(tracking, now)) refreshed++;
			}
			return refreshed;
		} finally {
			this.running = false;
		}
	}

	private async refreshOne(tracking: VideoTracking, now: Temporal.Instant): Promise<boolean> {
		const state = toTrackingState(tracking.state);
		const nextMetadataAt = toInstant(
			computeNextMetadataAt(state, new Date(now.epochMilliseconds))
		);

		try {
			const details = await this.deps.bilibiliClient.getVideoDetails(tracking.aid);
			await this.deps.discoveryRepository.upsertMetadata(
				toMetadataInput(tracking.aid, details)
			);
			await this.deps.trackingRepository.updateSchedule(tracking.aid, {
				nextSnapshotAt: tracking.nextSnapshotAt,
				nextMetadataAt,
				lastError: null,
			});
			appLogger.info("Refreshed tracked video metadata", {
				component: "metadata-refresh",
				aid: tracking.aid.toString(),
			});
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.deps.trackingRepository.updateSchedule(tracking.aid, {
				nextSnapshotAt: tracking.nextSnapshotAt,
				nextMetadataAt,
				lastError: message,
			});
			appLogger.warn("Failed to refresh tracked video metadata", {
				component: "metadata-refresh",
				aid: tracking.aid.toString(),
				error: message,
			});
			return false;
		}
	}
}
