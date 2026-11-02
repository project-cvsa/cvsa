import {
	AppError,
	type MilestoneImportRequest,
	type MilestoneRecord,
	type MilestoneAchievement,
	type MilestoneRecoveryJob,
	type MilestoneBacktestRequest,
	type MilestoneBacktestResult,
	type CacheWindowAnalysisRequest,
	type CacheWindowAnalysisResult,
	type TrackingPolicyConfig,
} from "@cvsa/contracts";
import { toInstant, type VideoMilestoneInsert } from "@cvsa/snapshot-db";
import { replayMilestone, analyzeCacheWindows } from "./simulation";
import type { IMilestoneRepository, MilestoneSample } from "./repository";

export function milestoneThresholds(views: number, extra?: number | null): number[] {
	const thresholds: number[] = [];
	if (views >= 100000) thresholds.push(100000);
	for (let value = 1000000; value <= views; value += 1000000) thresholds.push(value);
	if (extra && extra <= views && !thresholds.includes(extra)) thresholds.push(extra);
	return thresholds.sort((a, b) => a - b);
}

export class MilestoneService {
	constructor(
		private readonly repository: IMilestoneRepository,
		private readonly policy: () => TrackingPolicyConfig = () => ({})
	) {}
	async list(
		aid: string
	): Promise<{ items: MilestoneRecord[]; achievements: MilestoneAchievement[] }> {
		const items = (await this.repository.list(BigInt(aid))).map((row) => ({
			...row,
			aid: row.aid.toString(),
			at: row.at.toString(),
			previousAt: row.previousAt?.toString() ?? null,
			scheduledAt: row.scheduledAt?.toString() ?? null,
			requestStartedAt: row.requestStartedAt?.toString() ?? null,
			recordedAt: row.recordedAt.toString(),
		}));
		const achievements = [...new Set(items.map((item) => item.threshold))]
			.sort((a, b) => a - b)
			.map((threshold) => {
				const rows = items
					.filter((item) => item.threshold === threshold)
					.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
				const precise = rows.find(
					(row) => row.timeKind === "minute" || row.timeKind === "exact"
				);
				return {
					threshold,
					reachedMinute: precise
						? new Date(Math.floor(Date.parse(precise.at) / 60000) * 60000).toISOString()
						: null,
					firstObservedAt: rows.find((row) => row.timeKind === "observed")?.at ?? null,
					knownBy: new Date(
						Math.min(...rows.map((row) => Date.parse(row.at)))
					).toISOString(),
				};
			});
		return { items, achievements };
	}
	async import(input: MilestoneImportRequest): Promise<{ inserted: number }> {
		return {
			inserted: await this.repository.insert(
				input.items.map((item) => ({
					aid: BigInt(item.aid),
					threshold: item.threshold,
					at: toInstant(
						new Date(
							item.timeKind === "minute"
								? Math.floor(Date.parse(item.at) / 60000) * 60000
								: Date.parse(item.at)
						)
					),
					timeKind: item.timeKind,
					views: item.views ?? null,
					source: "manual",
					note: item.note,
				}))
			),
		};
	}
	async observe(
		aid: bigint,
		sample: MilestoneSample,
		previous: MilestoneSample | undefined,
		source: "live" | "history",
		extra?: number | null,
		timing?: { scheduledAt?: string; requestStartedAt: string }
	): Promise<number> {
		const thresholds = milestoneThresholds(sample.views, extra);
		if (thresholds.length === 0) return 0;
		const known = await this.repository.list(aid);
		const rows: VideoMilestoneInsert[] = [];
		for (const threshold of thresholds) {
			if (
				known.some(
					(row) =>
						row.threshold === threshold &&
						row.source === source &&
						row.at.epochMilliseconds <= Date.parse(sample.at)
				)
			)
				continue;
			const below = previous && previous.views < threshold ? previous : undefined;
			rows.push({
				aid,
				threshold,
				source,
				timeKind: "observed",
				at: toInstant(new Date(sample.at)),
				views: sample.views,
				previousAt: below ? toInstant(new Date(below.at)) : null,
				previousViews: below?.views ?? null,
				scheduledAt: timing?.scheduledAt ? toInstant(new Date(timing.scheduledAt)) : null,
				requestStartedAt: timing ? toInstant(new Date(timing.requestStartedAt)) : null,
			});
		}
		return this.repository.insert(rows);
	}
	async recover(
		job: MilestoneRecoveryJob
	): Promise<{ done: boolean; data: MilestoneRecoveryJob }> {
		if (!job.prepared) {
			await this.repository.prepareRecovery(job.recoveryId, job.minimumViews, job.through);
			return { done: false, data: { ...job, prepared: true, _timeoutMs: 120000 } };
		}
		const aid = job.currentAid
			? BigInt(job.currentAid)
			: await this.repository.nextCandidate(job.recoveryId, BigInt(job.afterAid));
		if (aid === null) {
			await this.repository.finishRecovery(job.recoveryId);
			return { done: true, data: job };
		}
		const samples = await this.repository.trace(
			aid,
			"1970-01-01T00:00:00Z",
			job.through,
			job.batchSize,
			job.afterTime
		);
		let previous = job.previous;
		let inserted = job.inserted;
		const known = new Map(
			(await this.repository.list(aid))
				.filter((row) => row.source === "history")
				.map((row) => [row.threshold, row.at.epochMilliseconds])
		);
		const pending: VideoMilestoneInsert[] = [];
		for (const sample of samples) {
			for (const threshold of milestoneThresholds(sample.views)) {
				const at = Date.parse(sample.at);
				if ((known.get(threshold) ?? Infinity) <= at) continue;
				pending.push({
					aid,
					threshold,
					source: "history",
					timeKind: "observed",
					at: toInstant(new Date(at)),
					views: sample.views,
					previousAt:
						previous && previous.views < threshold
							? toInstant(new Date(previous.at))
							: null,
					previousViews: previous && previous.views < threshold ? previous.views : null,
				});
				known.set(threshold, at);
			}
			previous = sample;
		}
		inserted += await this.repository.insert(pending);
		if (samples.length < job.batchSize)
			return {
				done: false,
				data: {
					...job,
					afterAid: String(aid),
					processed: job.processed + 1,
					inserted,
					currentAid: undefined,
					afterTime: undefined,
					previous: undefined,
				},
			};
		return {
			done: false,
			data: { ...job, currentAid: String(aid), afterTime: previous?.at, previous, inserted },
		};
	}
	private async loadTrace(aid: string, from: string, to: string): Promise<MilestoneSample[]> {
		const samples = await this.repository.trace(BigInt(aid), from, to, 100001);
		if (samples.length > 100000)
			throw new AppError(
				"Use a shorter range: analysis accepts at most 100000 samples per video",
				"VALIDATION_ERROR",
				422
			);
		return samples;
	}
	async backtest(input: MilestoneBacktestRequest): Promise<MilestoneBacktestResult> {
		const [samples, records] = await Promise.all([
			this.loadTrace(input.aid, input.from, input.to),
			this.repository.list(BigInt(input.aid)),
		]);
		const exact = records.find(
			(row) =>
				row.threshold === input.threshold &&
				(row.timeKind === "exact" || row.timeKind === "minute")
		);
		return replayMilestone(
			{ ...input, policy: { ...this.policy(), ...input.policy } },
			samples,
			exact?.at.epochMilliseconds
		);
	}
	async analyzeWindows(input: CacheWindowAnalysisRequest): Promise<CacheWindowAnalysisResult> {
		const traces = await Promise.all(
			input.aids.map(async (aid) => ({
				aid,
				samples: await this.loadTrace(aid, input.from, input.to),
			}))
		);
		return analyzeCacheWindows(input, traces);
	}
}
