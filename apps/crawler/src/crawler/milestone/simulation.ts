import type {
	MilestoneBacktestRequest,
	MilestoneBacktestResult,
	CacheWindowAnalysisRequest,
	CacheWindowAnalysisResult,
} from "@cvsa/contracts";
import { evaluateNextSchedule, MILESTONE_HISTORY_WINDOWS_MS } from "../tracking/scheduler";
import type { TrackingState } from "../tracking/types";
import type { MilestoneSample } from "./repository";

export function replayMilestone(
	input: MilestoneBacktestRequest,
	samples: MilestoneSample[],
	exactAt?: number
): MilestoneBacktestResult {
	const startedAt = performance.now();
	const firstIndex = samples.findIndex((sample) => sample.views >= input.threshold);
	const first = samples[firstIndex];
	const before = samples[firstIndex - 1];
	const minute = (at: number) => Math.floor(at / 60000) * 60000;
	const reference =
		exactAt !== undefined
			? minute(exactAt)
			: first && before && minute(Date.parse(first.at)) === minute(Date.parse(before.at))
				? minute(Date.parse(first.at))
				: undefined;
	let state: TrackingState = input.initialState;
	let dueAt = Date.parse(input.from);
	let previous: MilestoneSample | undefined;
	let target = state === "milestone" ? input.threshold : undefined;
	let requests = 0;
	let detectedAt: string | null = null;
	let enteredMilestoneAt: string | null = state === "milestone" ? input.from : null;
	let maxTraceGapMs = 0;
	const history: MilestoneSample[] = [];
	for (let index = 0; index < samples.length; index++) {
		const sample = samples[index];
		if (!sample) continue;
		const time = Date.parse(sample.at);
		const prior = samples[index - 1];
		if (prior) maxTraceGapMs = Math.max(maxTraceGapMs, time - Date.parse(prior.at));
		if (detectedAt || time < dueAt + input.executionDelayMs) continue;
		requests++;
		if (sample.views >= input.threshold) {
			detectedAt = sample.at;
			continue;
		}
		const windowHistory = MILESTONE_HISTORY_WINDOWS_MS.flatMap((windowMs) => {
			let left = 0;
			let right = history.length - 1;
			let found: MilestoneSample | undefined;
			while (left <= right) {
				const middle = Math.floor((left + right) / 2);
				const row = history[middle];
				if (row && Date.parse(row.at) <= time - windowMs) {
					found = row;
					left = middle + 1;
				} else right = middle - 1;
			}
			return found ? [found] : [];
		});
		if (windowHistory.length === 0 && history[0]) windowHistory.push(history[0]);
		const next = evaluateNextSchedule({
			aid: BigInt(input.aid),
			currentState: state,
			currentViews: sample.views,
			currentTime: time,
			previousViews: previous?.views,
			lastCapturedAt: previous ? Date.parse(previous.at) : null,
			acceptedAt: input.acceptedAt
				? Date.parse(input.acceptedAt)
				: samples[0]
					? Date.parse(samples[0].at)
					: time,
			publishedAt: input.publishedAt ? Date.parse(input.publishedAt) : undefined,
			targetMilestone: target,
			recentSnapshots: windowHistory.map((row) => ({
				capturedAt: Date.parse(row.at),
				views: row.views,
			})),
			policy: input.policy,
		});
		if (next.nextState === "milestone" && !enteredMilestoneAt) enteredMilestoneAt = sample.at;
		state = next.nextState;
		target = next.targetMilestone ?? undefined;
		dueAt = next.nextSnapshotAt.getTime();
		previous = sample;
		history.push(sample);
	}
	return {
		aid: input.aid,
		threshold: input.threshold,
		requests,
		traceSamples: samples.length,
		firstRecordedAt: first?.at ?? null,
		detectedAt,
		enteredMilestoneAt,
		referenceMinute: reference === undefined ? null : new Date(reference).toISOString(),
		minuteResult:
			reference === undefined
				? "unknown"
				: detectedAt && minute(Date.parse(detectedAt)) === reference
					? "captured"
					: "missed",
		delayFromFirstRecordedMs:
			first && detectedAt ? Date.parse(detectedAt) - Date.parse(first.at) : null,
		maxTraceGapMs,
		computeMs: performance.now() - startedAt,
	};
}

type ChangeInterval = { from: number; to: number };

function fitPeriod(intervals: ChangeInterval[], period: number): { phase: number; error: number } {
	let x = 0;
	let y = 0;
	for (const interval of intervals) {
		const angle = ((((interval.from + interval.to) / 2) % period) / period) * 2 * Math.PI;
		x += Math.cos(angle);
		y += Math.sin(angle);
	}
	const phase = ((Math.atan2(y, x) / (2 * Math.PI)) * period + period) % period;
	let error = 0;
	for (const interval of intervals) {
		const middle = (interval.from + interval.to) / 2;
		const tick = Math.round((middle - phase) / period) * period + phase;
		error += Math.max(interval.from - tick, tick - interval.to, 0);
	}
	return { phase, error: error / intervals.length };
}

export function analyzeCacheWindows(
	input: CacheWindowAnalysisRequest,
	traces: Array<{ aid: string; samples: MilestoneSample[] }>
): CacheWindowAnalysisResult {
	const intervals = traces.map((trace) => {
		const changes: ChangeInterval[] = [];
		let maxGap = 0;
		for (let index = 1; index < trace.samples.length; index++) {
			const previous = trace.samples[index - 1];
			const current = trace.samples[index];
			if (!previous || !current) continue;
			const from = Date.parse(previous.at);
			const to = Date.parse(current.at);
			maxGap = Math.max(maxGap, to - from);
			if (current.views > previous.views) changes.push({ from, to });
		}
		const stride = Math.max(1, Math.ceil(changes.length / 512));
		return {
			...trace,
			changes: changes.length,
			maxGap,
			intervals: changes.filter((_, index) => index % stride === 0),
		};
	});
	const best = (changes: ChangeInterval[]) => {
		const informative = changes.filter(
			(interval) => interval.to - interval.from < input.minimumPeriodMs
		);
		if (informative.length < 3) return null;
		let candidate: { period: number; phase: number; error: number } | null = null;
		let equalFits = 0;
		for (
			let period = input.minimumPeriodMs;
			period <= input.maximumPeriodMs;
			period += input.stepMs
		) {
			const fit = fitPeriod(informative, period);
			if (!candidate || fit.error < candidate.error - 0.001) {
				candidate = { period, ...fit };
				equalFits = 1;
			} else if (Math.abs(fit.error - candidate.error) <= 0.001) equalFits++;
		}
		return equalFits === 1 ? candidate : null;
	};
	const shared = best(intervals.flatMap((trace) => trace.intervals));
	return {
		videos: intervals.map((trace) => {
			const candidate = best(trace.intervals);
			return {
				aid: trace.aid,
				samples: trace.samples.length,
				changes: trace.changes,
				maxSampleGapMs: trace.maxGap,
				bestPeriodMs: candidate?.period ?? null,
				phaseMs: candidate?.phase ?? null,
				phaseErrorMs: candidate?.error ?? null,
			};
		}),
		sharedPeriodMs: shared?.period ?? null,
		sharedPhaseErrorMs: shared?.error ?? null,
	};
}
