import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient } from "../bilibili";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { ITrackingRepository } from "../tracking/repository.interface";
import {
	computeNextMetadataAt,
	evaluateNextSchedule,
	toScheduleReason,
} from "../tracking/scheduler";
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
	private readonly stats: StatsRecorder;

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly snapshotRepo: ISnapshotRepository,
		private readonly trackingRepo: ITrackingRepository,
		stats: StatsRecorder = createNoopStatsRecorder()
	) {
		this.stats = stats;
	}

	/**
	 * Hand a batch's leases back to the pool.
	 *
	 * A job that threw before writing any schedule must not leave its videos
	 * invisible until the 5-minute lease expires.
	 */
	async releaseLeases(
		aids: Array<number | bigint | string>,
		expectedLeaseUntil?: string
	): Promise<void> {
		const unique = [...new Set(aids.map((aid) => BigInt(aid)))];
		await this.trackingRepo.releaseLeases(
			unique,
			expectedLeaseUntil ? toInstant(new Date(expectedLeaseUntil)) : undefined
		);
	}

	async deferLeases(
		aids: Array<number | bigint | string>,
		delayMs: number,
		reason: "rate_limit" | "unavailable" | "local_capacity",
		leaseUntil?: string
	): Promise<void> {
		const expectedLeaseUntil = leaseUntil ? toInstant(new Date(leaseUntil)) : undefined;
		const unique = [...new Set(aids.map((aid) => BigInt(aid)))];
		const now = Date.now();
		const trackings = await this.trackingRepo.getTrackings(unique);
		for (const tracking of trackings) {
			await this.trackingRepo.updateSchedule(
				tracking.aid,
				{
					nextSnapshotAt: toInstant(new Date(now + delayMs)),
					...(reason === "local_capacity"
						? {}
						: {
								lastError:
									reason === "rate_limit"
										? "network:rate_limited"
										: "network:adapter_unavailable",
							}),
					leaseUntil: null,
				},
				expectedLeaseUntil
			);
		}
	}

	async processBatch(
		aids: Array<number | bigint | string>,
		leaseUntil?: string
	): Promise<BatchProcessResult> {
		return traceTask("snapshot.processBatch", async () => {
			const expectedLeaseUntil = leaseUntil ? toInstant(new Date(leaseUntil)) : undefined;
			let uniqueBigIntAids = [...new Set(aids.map((aid) => BigInt(aid)))];
			if (expectedLeaseUntil) {
				const owned = await this.trackingRepo.getTrackings(uniqueBigIntAids);
				uniqueBigIntAids = owned
					.filter(
						(row) =>
							row.leaseUntil?.epochMilliseconds ===
							expectedLeaseUntil.epochMilliseconds
					)
					.map((row) => row.aid);
			}
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
				const lastError = `bilibili_api_error:${response}`;

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

					await this.trackingRepo.updateSchedule(
						aid,
						{
							state: next.nextState,
							nextSnapshotAt: toInstant(next.nextSnapshotAt),
							consecutiveFails: fails,
							priority: next.priority,
							leaseUntil: null,
							lastError,
							scheduleReason: toScheduleReason(next),
						},
						expectedLeaseUntil
					);
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
				this.stats.recordSnapshotsSaved(receivedStats.length);
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

				// Fetch recent history for active videos so multi-window milestone ETA
				// can evaluate 100k, 1M, 10M+ targets across all non-archived states.
				let recentSnapshots: Array<{ capturedAt: Date; views: number }> | undefined;
				if (tracking?.state !== "archive") {
					const history = await this.snapshotRepo.getRecentSnapshots(aid, 6);
					recentSnapshots = history.map((h) => ({
						capturedAt: new Date(h.capturedAt.epochMilliseconds),
						views: h.views,
					}));
				}

				// For new videos, anchor the 1.5/3/5/10m initial sampling cadence to
				// the earliest snapshot (or publishedAt if within the initial window).
				const earliestSnapshotMs =
					recentSnapshots && recentSnapshots.length > 0
						? Math.min(...recentSnapshots.map((s) => s.capturedAt.getTime()))
						: undefined;
				const acceptedAt =
					tracking?.state === "new"
						? earliestSnapshotMs !== undefined
							? new Date(earliestSnapshotMs)
							: new Date(response.time)
						: undefined;

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
					acceptedAt,
					targetMilestone: tracking?.targetMilestone,
					consecutiveFails: 0,
					recentSnapshots,
				});

				await this.trackingRepo.updateSchedule(
					aid,
					{
						state: next.nextState,
						nextSnapshotAt: toInstant(next.nextSnapshotAt),
						lastViews: stat.views,
						lastCapturedAt: capturedAt,
						velocity: next.velocity,
						targetMilestone: next.targetMilestone,
						etaHours: next.etaHours,
						priority: next.priority,
						consecutiveFails: 0,
						// A committed sample fully settles the job: release the in-flight
						// lease, clear the failure, and book the next metadata refresh.
						leaseUntil: null,
						lastError: null,
						scheduleReason: toScheduleReason(next),
						nextMetadataAt: toInstant(
							computeNextMetadataAt(next.nextState, response.time)
						),
					},
					expectedLeaseUntil
				);
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

				await this.trackingRepo.updateSchedule(
					aid,
					{
						state: next.nextState,
						nextSnapshotAt: toInstant(next.nextSnapshotAt),
						consecutiveFails: fails,
						priority: next.priority,
						leaseUntil: null,
						lastError: "video_missing_from_stats_response",
						scheduleReason: toScheduleReason(next),
					},
					expectedLeaseUntil
				);
			}

			return {
				status: "success",
				inserted: receivedStats.length,
				missingCount: missingAids.length,
			};
		});
	}
}
