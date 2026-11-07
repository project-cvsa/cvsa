import { appLogger } from "@cvsa/logger";
import type { TrackingPolicyConfig } from "@cvsa/contracts/crawler/policies";
import { trackingRetryMs } from "../tracking/policy";
import { traceTask } from "@cvsa/observability";
import { toInstant } from "@cvsa/snapshot-db";
import type { BilibiliClient } from "../bilibili";
import { classifyBilibiliError, isTerminalVideoFailure } from "../bilibili/errors";
import { withBilibiliPurpose } from "../bilibili/requestContext";
import { createNoopStatsRecorder, type StatsRecorder } from "../stats/types";
import type { ITrackingRepository, UpdateScheduleInput } from "../tracking/repository.interface";
import {
	computeNextMetadataAt,
	evaluateNextSchedule,
	toScheduleReason,
} from "../tracking/scheduler";
import type { TrackingState } from "../tracking/types";
function trackingState(state: string | undefined): TrackingState {
	if (state === "new" || state === "milestone" || state === "archive") return state;
	return "regular";
}
import type { ISnapshotRepository } from "./repository.interface";
import type { MilestoneService } from "../milestone/service";

export interface BatchProcessSuccess {
	status: "success";
	inserted: number;
	missingCount: number;
	retryAids?: string[];
}

export interface BatchProcessApiError {
	status: "api_error";
	code: number;
}

export type BatchProcessResult = BatchProcessSuccess | BatchProcessApiError;

export class SnapshotService {
	private readonly stats: StatsRecorder;
	private policy: TrackingPolicyConfig = {};
	configure(policy: TrackingPolicyConfig): void {
		this.policy = policy;
	}

	constructor(
		private readonly bilibiliClient: BilibiliClient,
		private readonly snapshotRepo: ISnapshotRepository,
		private readonly trackingRepo: ITrackingRepository,
		stats: StatsRecorder = createNoopStatsRecorder(),
		private readonly milestones?: MilestoneService,
		private readonly transaction: <T>(work: () => Promise<T>) => Promise<T> = (work) => work()
	) {
		this.stats = stats;
	}

	async retryBatch(
		aids: Array<number | bigint | string>,
		requestedMs: number | undefined,
		reason: string,
		leaseUntil?: string
	): Promise<{ aids: string[]; leaseUntil: string; delayMs: number }> {
		return this.transaction(async () => {
			const expected = leaseUntil ? toInstant(new Date(leaseUntil)) : undefined;
			const rows = (await this.trackingRepo.getTrackings(aids.map(BigInt))).filter(
				(row) =>
					!expected || row.leaseUntil?.epochMilliseconds === expected.epochMilliseconds
			);
			const delayMs =
				requestedMs ??
				Math.min(...rows.map((row) => trackingRetryMs(row.state, this.policy)));
			const effectiveDelay = rows.length === 0 ? 0 : delayMs;
			const renewed = new Date(Date.now() + effectiveDelay + 5 * 60000);
			const updates = rows.map((row) => ({
				aid: row.aid,
				update: {
					leaseUntil: toInstant(renewed),
					eligibleAt: toInstant(new Date(Date.now() + effectiveDelay)),
					...(reason === "local_capacity"
						? {}
						: { consecutiveFails: row.consecutiveFails + 1, lastError: reason }),
				},
				expectedLeaseUntil: expected,
			}));
			await this.trackingRepo.updateSchedules(updates);
			return {
				aids: rows.map((row) => row.aid.toString()),
				leaseUntil: renewed.toISOString(),
				delayMs: effectiveDelay,
			};
		});
	}

	async processBatch(
		aids: Array<number | bigint | string>,
		leaseUntil?: string,
		scheduledAt?: string
	): Promise<BatchProcessResult> {
		return traceTask("snapshot.processBatch", async () => {
			const expectedLeaseUntil = leaseUntil ? toInstant(new Date(leaseUntil)) : undefined;
			let uniqueBigIntAids = [...new Set(aids.map((aid) => BigInt(aid)))];
			if (expectedLeaseUntil) {
				const owned = await this.trackingRepo.getTrackings(uniqueBigIntAids);
				const valid = owned
					.filter(
						(row) =>
							row.leaseUntil?.epochMilliseconds ===
							expectedLeaseUntil.epochMilliseconds
					)
					.map((row) => row.aid);
				if (valid.length < uniqueBigIntAids.length)
					this.stats.record("staleLeaseItems", uniqueBigIntAids.length - valid.length);
				uniqueBigIntAids = valid;
			}
			if (uniqueBigIntAids.length === 0) {
				return { status: "success", inserted: 0, missingCount: 0 };
			}

			const requestStartedAt = new Date().toISOString();
			const response = await this.bilibiliClient.bulkGetVideoStats(
				uniqueBigIntAids.map((a) => a.toString())
			);

			if (typeof response === "number") {
				// API error code returned (e.g. -412, -509)
				appLogger.warn("Bilibili bulk stats API failure during batch processing", {
					component: "snapshot-service",
					code: response,
					batchSize: uniqueBigIntAids.length,
					sampleAids: uniqueBigIntAids.slice(0, 10).map((a) => a.toString()),
				});

				return { status: "api_error", code: response };
			}

			const result = await this.transaction(async (): Promise<BatchProcessSuccess> => {
				const capturedAt = toInstant(new Date(response.time));
				const receivedStats = response.data;
				const receivedAidSet = new Set(receivedStats.map((s) => BigInt(s.aid)));

				// Bulk write snapshots into VideoSnapshot
				let inserted = 0;
				if (receivedStats.length > 0) {
					inserted = await this.snapshotRepo.createSnapshots(
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
					this.stats.record("videosRecorded", inserted);
					if (receivedStats.length > inserted)
						this.stats.record("videoInsertConflicts", receivedStats.length - inserted);
				}

				// Retrieve tracking state for all requested videos
				const trackings = await this.trackingRepo.getTrackings(uniqueBigIntAids);
				const trackingMap = new Map(trackings.map((t) => [t.aid, t]));

				const activeAids = receivedStats
					.map((s) => BigInt(s.aid))
					.filter((aid) => trackingMap.get(aid)?.state !== "archive");
				const historiesByAid =
					activeAids.length > 0 && this.snapshotRepo.getSchedulingHistories
						? await this.snapshotRepo.getSchedulingHistories(activeAids, capturedAt)
						: undefined;

				const scheduleUpdates: Array<{
					aid: bigint;
					update: UpdateScheduleInput;
					expectedLeaseUntil?: ReturnType<typeof toInstant>;
				}> = [];

				// Process received stats and update tracking
				for (const stat of receivedStats) {
					const aid = BigInt(stat.aid);
					const tracking = trackingMap.get(aid);
					await this.milestones?.observe(
						aid,
						{ at: capturedAt.toString(), views: stat.views },
						tracking?.lastCapturedAt
							? { at: tracking.lastCapturedAt.toString(), views: tracking.lastViews }
							: undefined,
						"live",
						tracking?.targetMilestone,
						{ scheduledAt, requestStartedAt }
					);

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
						const history = historiesByAid
							? (historiesByAid.get(aid) ?? [])
							: await this.snapshotRepo.getSchedulingHistory(aid, capturedAt);
						recentSnapshots = history.map((h) => ({
							capturedAt: new Date(h.capturedAt.epochMilliseconds),
							views: h.views,
						}));
					}

					// For new videos, anchor the 1.5/3/5/10m initial sampling cadence to
					// the first captured snapshot time recorded on the tracking row.
					const acceptedAt =
						tracking?.state === "new"
							? tracking.firstCapturedAt
								? new Date(tracking.firstCapturedAt.epochMilliseconds)
								: tracking.lastCapturedAt
									? new Date(tracking.lastCapturedAt.epochMilliseconds)
									: new Date(capturedAt.epochMilliseconds)
							: undefined;

					const next = evaluateNextSchedule({
						aid,
						currentState: trackingState(tracking?.state),
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
						policy: this.policy,
						recentSnapshots,
					});

					scheduleUpdates.push({
						aid,
						update: {
							state: next.nextState,
							nextSnapshotAt: toInstant(next.nextSnapshotAt),
							lastViews: stat.views,
							firstCapturedAt:
								tracking?.firstCapturedAt ?? tracking?.lastCapturedAt ?? capturedAt,
							lastCapturedAt: capturedAt,
							velocity: next.velocity,
							targetMilestone: next.targetMilestone,
							etaHours: next.etaHours,
							priority: next.priority,
							consecutiveFails: 0,
							// A committed sample fully settles the job: release the in-flight
							// lease, clear the failure, and book the next metadata refresh.
							leaseUntil: null,
							eligibleAt: null,
							lastError: null,
							scheduleReason: toScheduleReason(next),
							nextMetadataAt:
								tracking?.nextMetadataAt ??
								toInstant(computeNextMetadataAt(next.nextState, response.time)),
						},
						expectedLeaseUntil,
					});
				}

				await this.trackingRepo.updateSchedules(scheduleUpdates);

				// Handle videos missing from Bilibili's response (e.g. deleted or private)
				const missingAids = uniqueBigIntAids.filter((aid) => !receivedAidSet.has(aid));
				if (missingAids.length > 0) {
					appLogger.warn("Videos missing from bulk stats response", {
						component: "snapshot-service",
						count: missingAids.length,
						missingAids: missingAids.map((a) => a.toString()),
					});
				}

				return {
					status: "success",
					inserted,
					missingCount: missingAids.length,
					retryAids: missingAids.map(String),
				};
			});
			const pending = await this.trackingRepo.getTrackings(
				(result.retryAids ?? []).map(BigInt)
			);
			const unavailable = new Set<string>();
			for (const row of pending) {
				if (row.lastError !== "video_missing_from_stats_response") continue;
				try {
					await withBilibiliPurpose("tracking", () =>
						this.bilibiliClient.getVideoDetails(row.aid)
					);
				} catch (error) {
					const failure = classifyBilibiliError(error);
					if (!isTerminalVideoFailure(failure)) throw error;
					const next = evaluateNextSchedule({
						aid: row.aid,
						currentState: trackingState(row.state),
						currentViews: row.lastViews,
						currentTime: Date.now(),
						consecutiveFails: row.consecutiveFails + 1,
						failureKind: "unavailable",
						policy: this.policy,
					});
					await this.trackingRepo.updateSchedule(
						row.aid,
						{
							state: next.nextState,
							nextSnapshotAt: toInstant(next.nextSnapshotAt),
							priority: next.priority,
							leaseUntil: null,
							eligibleAt: null,
							consecutiveFails: row.consecutiveFails + 1,
							lastError: `bilibili:video_${failure.kind}:${failure.code}`,
							scheduleReason: toScheduleReason(next),
							nextMetadataAt: toInstant(
								computeNextMetadataAt(next.nextState, Date.now())
							),
						},
						expectedLeaseUntil
					);
					unavailable.add(String(row.aid));
				}
			}
			return {
				...result,
				retryAids: result.retryAids?.filter((aid) => !unavailable.has(aid)),
			};
		});
	}
}
