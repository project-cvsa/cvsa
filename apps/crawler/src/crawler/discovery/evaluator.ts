import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import {
	classifyBilibiliError,
	isTerminalVideoFailure,
	videoStatusForAvailability,
	type BilibiliClient,
	type VideoDetailsData,
} from "../bilibili";
import type { ITrackingRepository } from "../tracking/repository.interface";
import { resolveTrackingPolicy } from "../tracking/policy";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { VideoClassifierClient } from "./classifier";
import type { DiscoveryFilterService, FilterDecision } from "./filter";
import type { IDiscoveryRepository } from "./repository.interface";
import { fromDetailTags } from "./tags";
import type { CandidateSource, UpsertMetadataInput } from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface CandidateEvaluationInput {
	aid: bigint;
	source: CandidateSource;
	/** Skip the "already tracked" short-circuit (metadata refresh paths). */
	force?: boolean;
}

export type CandidateEvaluation =
	| {
			status: "accepted";
			decision: FilterDecision;
			details: VideoDetailsData;
			metadata: UpsertMetadataInput;
	  }
	| { status: "rejected"; decision: FilterDecision; details: VideoDetailsData }
	| { status: "skipped"; reason: "already_tracked" }
	| {
			status: "failed";
			reason: "fetch_failed" | "video_unavailable";
			videoStatus?: string;
			errorMessage?: string;
	  };

/**
 * Single-video discovery pipeline: detail fetch → filter/classifier → metadata
 * and sample persistence → tracking promotion.
 *
 * Extracted from the worker so the manual control-plane paths
 * (`DiscoveryService.runSearchSweep`, `processVideoRecommendations`) run through
 * exactly the same gate as the queued worker instead of inserting candidates
 * straight into `video_tracking`.
 */
export class DiscoveryCandidateEvaluator {
	private readonly stats: StatsRecorder;

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly discoveryRepo: IDiscoveryRepository,
		private readonly trackingRepo: ITrackingRepository,
		private readonly filterService: DiscoveryFilterService,
		private readonly classifier?: VideoClassifierClient,
		stats: StatsRecorder = createNoopStatsRecorder()
	) {
		this.stats = stats;
	}

	async evaluate(input: CandidateEvaluationInput): Promise<CandidateEvaluation> {
		return traceTask("discovery.evaluateCandidate", async () => {
			const { aid, source } = input;

			if (!input.force) {
				const existing = await this.trackingRepo.getTracking(aid);
				if (existing) return { status: "skipped", reason: "already_tracked" };
			}

			let details: VideoDetailsData;
			const fetchStartedAt = performance.now();
			try {
				details = await this.bilibiliClient.getVideoDetails(aid);
			} catch (error) {
				return this.handleFetchFailure(aid, error);
			} finally {
				this.stats.recordTask(performance.now() - fetchStartedAt);
			}
			this.stats.recordCandidatesScanned();

			const view = details.View;
			const card = details.Card;
			const tags = details.Tags ?? [];
			const tagNames = tags.map((tag) => tag.tag_name);

			const classifyStartedAt = performance.now();
			const decision = await this.filterService.evaluateCandidate(
				{
					title: view.title,
					tags: tagNames,
					description: view.desc,
					duration: view.duration,
					aid,
				},
				this.classifier
			);
			if (decision.model) {
				this.stats.recordInference(performance.now() - classifyStartedAt, true);
			}

			const now = toInstant(new Date());
			const pubdate = view.pubdate ? toInstant(new Date(view.pubdate * 1_000)) : null;
			const ctime = view.ctime ? toInstant(new Date(view.ctime * 1_000)) : null;

			const metadata: UpsertMetadataInput = {
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
				pubdate,
				ctime,
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
				// Structured tags keep `tag_id` / `tag_type` / `music_id`; the filter
				// only needs the names, and `tagNames` is derived from the same list.
				tags: fromDetailTags(tags),
				videoStatus: "normal",
				filterDecision:
					decision.reason === "model_unavailable"
						? "pending"
						: decision.action === "accept"
							? "accepted"
							: "rejected",
				modelScore: decision.confidence,
				modelVersion: decision.model?.modelVersion ?? null,
				discoverySource: source,
				capturedAt: now,
			};

			if (decision.action === "accept") {
				await this.discoveryRepo.upsertMetadata(metadata);
				await this.discoveryRepo.upsertSample({
					aid,
					bvid: view.bvid,
					title: view.title,
					description: view.desc ?? null,
					tags: tagNames,
					decision: decision.reason === "whitelist_hit" ? "whitelist" : "model_accepted",
					modelVersion: decision.model?.modelVersion ?? "rules",
					probabilities: decision.model?.probabilities ?? [],
					songProbability: decision.model?.songProbability ?? decision.confidence,
					createdAt: now,
				});
				await this.trackingRepo.upsertTracking({
					aid,
					state: "new",
					nextSnapshotAt: now,
					publishedAt: pubdate,
					priority: 2,
					scheduleReason: "initial",
					lastError: null,
				});

				appLogger.info("Discovery candidate accepted and added to tracking", {
					component: "discovery-evaluator",
					aid: aid.toString(),
					title: view.title,
					reason: decision.reason,
					source,
					modelVersion: decision.model?.modelVersion,
				});

				return { status: "accepted", decision, details, metadata };
			}

			if (decision.reason === "model_unavailable") {
				// Keep the metadata as pending when the ONNX model is unavailable
				// so no candidate is silently lost during model initialization.
				await this.discoveryRepo.upsertMetadata(metadata);
			}

			if (decision.sampled) {
				await this.discoveryRepo.upsertSample({
					aid,
					bvid: view.bvid,
					title: view.title,
					description: view.desc ?? null,
					tags: tagNames,
					decision: "model_rejected",
					modelVersion: decision.model?.modelVersion ?? "rules",
					probabilities: decision.model?.probabilities ?? [],
					songProbability: decision.model?.songProbability ?? decision.confidence,
					createdAt: now,
				});
				appLogger.info(
					"Discovery candidate rejected but sampled for the training dataset",
					{
						component: "discovery-evaluator",
						aid: aid.toString(),
						title: view.title,
						reason: decision.reason,
					}
				);
			} else {
				appLogger.debug("Discovery candidate rejected and discarded", {
					component: "discovery-evaluator",
					aid: aid.toString(),
					title: view.title,
					reason: decision.reason,
				});
			}

			return { status: "rejected", decision, details };
		});
	}

	/**
	 * A failed detail fetch is the only place Bilibili tells us a video is gone.
	 * Deleted/private videos get their metadata status corrected and are parked
	 * in `archive` so the dispatcher stops chasing them.
	 */
	private async handleFetchFailure(aid: bigint, error: unknown): Promise<CandidateEvaluation> {
		const classification = classifyBilibiliError(error);
		const errorMessage = error instanceof Error ? error.message : String(error);

		appLogger.warn("Failed to fetch video details for candidate", {
			component: "discovery-evaluator",
			aid: aid.toString(),
			code: classification.code,
			kind: classification.kind,
			error: errorMessage,
		});

		if (!isTerminalVideoFailure(classification)) {
			return { status: "failed", reason: "fetch_failed", errorMessage };
		}

		const videoStatus = videoStatusForAvailability(classification);
		const existingMetadata = await this.discoveryRepo.getMetadata(aid);
		if (videoStatus && existingMetadata) {
			// Reuses upsertMetadata so the transition lands in the metadata history
			// as a `status_changed` record.
			await this.discoveryRepo.upsertMetadata({
				aid,
				bvid: existingMetadata.bvid,
				title: existingMetadata.title,
				videoStatus,
				filterDecision: existingMetadata.filterDecision,
			});
		}

		const tracking = await this.trackingRepo.getTracking(aid);
		if (tracking) {
			const policy = resolveTrackingPolicy();
			await this.trackingRepo.updateSchedule(aid, {
				state: "archive",
				nextSnapshotAt: toInstant(
					new Date(Date.now() + policy.archiveIntervalDays * DAY_MS)
				),
				consecutiveFails: tracking.consecutiveFails + 1,
				priority: 4,
				leaseUntil: null,
				lastError: `${videoStatus ?? "unavailable"}: ${errorMessage}`.slice(0, 500),
				scheduleReason: "archive_recheck",
			});
		}

		return { status: "failed", reason: "video_unavailable", videoStatus, errorMessage };
	}
}
