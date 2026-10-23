import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient } from "../bilibili";
import type { ITrackingRepository } from "../tracking/repository.interface";
import { evaluateNextSchedule } from "../tracking/scheduler";
import type { TrackingState } from "../tracking/types";
import type { ISnapshotRepository } from "./repository.interface";

export interface BatchProcessSuccess {
	status: "success";
	inserted: number;
	missingCount: number;
}

export interface BatchProcessApiError {
	status: "api_error";
	code: number;
}

export type BatchProcessResult = BatchProcessSuccess | BatchProcessApiError;

export class SnapshotService {
	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly snapshotRepo: ISnapshotRepository,
		private readonly trackingRepo: ITrackingRepository
	) {}

	async processBatch(aids: Array<number | bigint | string>): Promise<BatchProcessResult> {
		return traceTask("snapshot.processBatch", async () => {
			const uniqueBigIntAids = [...new Set(aids.map((aid) => BigInt(aid)))];
			if (uniqueBigIntAids.length === 0) {
				return { status: "success", inserted: 0, missingCount: 0 };
			}

			const nowMs = Date.now();
			const response = await this.bilibiliClient.bulkGetVideoStats(
				uniqueBigIntAids.map((a) => a.toString())
			);

			if (typeof response === "number") {
				// API error code returned (e.g. -412, -509)
				appLogger.warn("Bilibili bulk stats API failure during batch processing", {
					component: "snapshot-service",
					code: response,
					batchSize: uniqueBigIntAids.length,
				});

				const trackings = await this.trackingRepo.getTrackings(uniqueBigIntAids);
				const trackingMap = new Map(trackings.map((t) => [t.aid, t]));

				for (const aid of uniqueBigIntAids) {
					const tracking = trackingMap.get(aid);
					const fails = (tracking?.consecutiveFails ?? 0) + 1;
					const next = evaluateNextSchedule({
						aid,
						currentState: (tracking?.state as TrackingState) ?? "regular",
						currentViews: tracking?.lastViews ?? 0,
						currentTime: nowMs,
						consecutiveFails: fails,
					});

					await this.trackingRepo.updateSchedule(aid, {
						state: next.nextState,
						nextSnapshotAt: toInstant(next.nextSnapshotAt),
						consecutiveFails: fails,
						priority: next.priority,
					});
				}

				return { status: "api_error", code: response };
			}

			const capturedAt = toInstant(new Date(response.time));
			const receivedStats = response.data;
			const receivedAidSet = new Set(receivedStats.map((s) => BigInt(s.aid)));

			// Bulk write snapshots into VideoSnapshot
			if (receivedStats.length > 0) {
				await this.snapshotRepo.createSnapshots(
					receivedStats.map((stat) => ({
						aid: BigInt(stat.aid),
						capturedAt,
						views: stat.views,
						coins: stat.coins,
						likes: stat.likes,
						favorites: stat.favorites,
						shares: stat.shares,
						danmakus: stat.danmakus,
						replies: stat.replies,
					}))
				);
			}

			// Retrieve tracking state for all requested videos
			const trackings = await this.trackingRepo.getTrackings(uniqueBigIntAids);
			const trackingMap = new Map(trackings.map((t) => [t.aid, t]));

			// Process received stats and update tracking
			for (const stat of receivedStats) {
				const aid = BigInt(stat.aid);
				const tracking = trackingMap.get(aid);

				// Check milestone achievement
				if (
					tracking &&
					tracking.state === "milestone" &&
					tracking.targetMilestone &&
					stat.views >= tracking.targetMilestone
				) {
					appLogger.info("Video achieved target milestone", {
						component: "snapshot-service",
						aid: aid.toString(),
						milestone: tracking.targetMilestone,
						views: stat.views,
					});
				}

				// If tracking state is milestone or nearing milestone, fetch recent history
				let recentSnapshots: Array<{ capturedAt: Date; views: number }> | undefined;
				if (
					tracking?.state === "milestone" ||
					(stat.views > 90_000 && stat.views < 100_000)
				) {
					const history = await this.snapshotRepo.getRecentSnapshots(aid, 6);
					recentSnapshots = history.map((h) => ({
						capturedAt: new Date(h.capturedAt.epochMilliseconds),
						views: h.views,
					}));
				}

				const next = evaluateNextSchedule({
					aid,
					currentState: (tracking?.state as TrackingState) ?? "regular",
					currentViews: stat.views,
					previousViews: tracking?.lastViews,
					lastCapturedAt: tracking?.lastCapturedAt
						? new Date(tracking.lastCapturedAt.epochMilliseconds)
						: null,
					currentTime: response.time,
					publishedAt: tracking?.publishedAt
						? new Date(tracking.publishedAt.epochMilliseconds)
						: null,
					targetMilestone: tracking?.targetMilestone,
					consecutiveFails: 0,
					recentSnapshots,
				});

				await this.trackingRepo.updateSchedule(aid, {
					state: next.nextState,
					nextSnapshotAt: toInstant(next.nextSnapshotAt),
					lastViews: stat.views,
					lastCapturedAt: capturedAt,
					velocity: next.velocity,
					targetMilestone: next.targetMilestone,
					etaHours: next.etaHours,
					priority: next.priority,
					consecutiveFails: 0,
				});
			}

			// Handle videos missing from Bilibili's response (e.g. deleted or private)
			const missingAids = uniqueBigIntAids.filter((aid) => !receivedAidSet.has(aid));
			for (const aid of missingAids) {
				const tracking = trackingMap.get(aid);
				const fails = (tracking?.consecutiveFails ?? 0) + 1;
				const next = evaluateNextSchedule({
					aid,
					currentState: (tracking?.state as TrackingState) ?? "regular",
					currentViews: tracking?.lastViews ?? 0,
					currentTime: nowMs,
					consecutiveFails: fails,
				});

				await this.trackingRepo.updateSchedule(aid, {
					state: next.nextState,
					nextSnapshotAt: toInstant(next.nextSnapshotAt),
					consecutiveFails: fails,
					priority: next.priority,
				});
			}

			return {
				status: "success",
				inserted: receivedStats.length,
				missingCount: missingAids.length,
			};
		});
	}
}
