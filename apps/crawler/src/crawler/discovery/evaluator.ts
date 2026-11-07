import { RetryLaterError } from "../shared/retryLater";
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
import { toDiscoveryDecision, type DiscoveryFilterService, type FilterDecision } from "./filter";
import type { IDiscoveryRepository } from "./repository.interface";
import { toMetadataInput } from "./metadata";
import type {
	CandidateSource,
	DiscoveryContext,
	DiscoveryOrigin,
	UpsertMetadataInput,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface CandidateEvaluationInput {
	aid: bigint;
	source: CandidateSource;
	/** Discovery path captured when the candidate was enqueued. */
	origin?: DiscoveryOrigin;
	/** Queue job that produced this evaluation, when there is one. */
	job?: { id: string; sweepId?: string };
	/** Skip the "already tracked" short-circuit (metadata refresh paths). */
	force?: boolean;
}

function fallbackOrigin(source: CandidateSource): DiscoveryOrigin {
	const channel =
		source === "related" || source === "hot_sample"
			? "related"
			: source === "manual"
				? "manual"
				: "search";
	return {
		channel,
		capturedAt: new Date().toISOString(),
		...(channel === "manual" ? { manual: { action: "detail" } } : {}),
	};
}

export type CandidateEvaluation =
	| {
			status: "accepted";
			decision: FilterDecision;
			details: VideoDetailsData;
			metadata: UpsertMetadataInput;
	  }
	| { status: "rejected"; decision: FilterDecision; details: VideoDetailsData }
	| { status: "skipped"; reason: "already_tracked" | "human_rejected" }
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
function channelOf(source: CandidateSource): "search" | "related" | "manual" | "hot_sample" {
	if (source === "search") return "search";
	if (source === "manual") return "manual";
	if (source === "hot_sample") return "hot_sample";
	return "related";
}

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
			const channel = channelOf(source);
			this.stats.record("candidatesStarted");
			this.stats.recordDiscovery(channel, "appeared");
			const origin = input.origin ?? fallbackOrigin(source);

			const labeled = await this.discoveryRepo.getSample(aid);
			if (labeled?.humanLabel === 0) {
				this.finishCandidate(channel, "skipped");
				return { status: "skipped", reason: "human_rejected" };
			}

			const existingTracking = await this.trackingRepo.getTracking(aid);
			if (existingTracking && !input.force) {
				this.finishCandidate(channel, "skipped");
				return { status: "skipped", reason: "already_tracked" };
			}

			let details: VideoDetailsData;
			try {
				details = await this.bilibiliClient.getVideoDetails(aid);
			} catch (error) {
				this.finishCandidate(
					channel,
					error instanceof RetryLaterError ? "deferred" : "failure"
				);
				return this.handleFetchFailure(aid, error);
			}

			const view = details.View;
			const tags = details.Tags ?? [];
			const tagNames = tags.map((tag) => tag.tag_name);

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

			if (decision.reason === "model_unavailable")
				this.stats.recordDeferral({ reason: "model_unavailable" });
			const now = toInstant(new Date());
			const pubdate = view.pubdate ? toInstant(new Date(view.pubdate * 1_000)) : null;
			const discoveryContext: DiscoveryContext = {
				origin,
				decision: toDiscoveryDecision(decision),
				...(input.job ? { job: input.job } : {}),
			};

			const metadata: UpsertMetadataInput = toMetadataInput(aid, details, {
				filterDecision:
					decision.reason === "model_unavailable"
						? "pending"
						: decision.action === "accept"
							? "accepted"
							: "rejected",
				modelScore: decision.confidence,
				modelVersion: decision.model?.modelVersion ?? null,
				discoverySource: origin.channel,
				discoveryContext,
			});

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
				// A human may have untracked the video while the detail fetch was in
				// flight; never let that evaluation add it back.
				const latest = await this.discoveryRepo.getSample(aid);
				if (latest?.humanLabel === 0) {
					this.finishCandidate(channel, "skipped");
					return { status: "skipped", reason: "human_rejected" };
				}
				await this.trackingRepo.upsertTracking({
					aid,
					state: "new",
					nextSnapshotAt: now,
					publishedAt: pubdate,
					priority: 2,
					scheduleReason: "initial",
					lastError: null,
				});

				this.stats.recordDiscoveryDecision(decision.reason, true);
				this.finishCandidate(channel, existingTracking ? "existing" : "newTracking");

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

			// Clean up any residual metadata row for rejected candidate to prevent table bloat
			await this.discoveryRepo.deleteMetadata(aid);

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

			this.stats.recordDiscoveryDecision(decision.reason, false);
			this.finishCandidate(channel, "rejected");
			return { status: "rejected", decision, details };
		});
	}

	private finishCandidate(
		channel: "search" | "related" | "manual" | "hot_sample",
		result:
			| "newTracking"
			| "existing"
			| "rejected"
			| "skipped"
			| "deferred"
			| "cancelled"
			| "timeout"
			| "failure"
	): void {
		this.stats.recordDiscovery(channel, result);
		this.stats.record("candidatesFinished");
	}

	/**
	 * A failed detail fetch is the only place Bilibili tells us a video is gone.
	 * Deleted/private videos get their metadata status corrected and are parked
	 * in `archive` so the dispatcher stops chasing them.
	 */
	private async handleFetchFailure(aid: bigint, error: unknown): Promise<CandidateEvaluation> {
		if (error instanceof RetryLaterError) throw error;
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
