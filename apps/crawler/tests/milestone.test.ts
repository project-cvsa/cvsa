import { describe, expect, test } from "bun:test";
import {
	MilestoneImportRequestSchema,
	MilestoneRecoveryJobSchema,
	MilestoneBacktestRequestSchema,
	CacheWindowAnalysisRequestSchema,
} from "@cvsa/contracts";
import { toInstant, type VideoMilestone, type VideoMilestoneInsert } from "@cvsa/snapshot-db";
import { MilestoneService } from "../src/crawler/milestone/service";
import type { IMilestoneRepository, MilestoneSample } from "../src/crawler/milestone/repository";
import { replayMilestone, analyzeCacheWindows } from "../src/crawler/milestone/simulation";

const start = Date.parse("2026-11-01T00:00:00Z");
const at = (ms: number) => new Date(start + ms).toISOString();

class MemoryMilestones implements IMilestoneRepository {
	rows: VideoMilestone[] = [];
	samples = new Map<bigint, MilestoneSample[]>();
	candidates = new Map<string, bigint[]>();
	async list(aid: bigint) {
		return this.rows
			.filter((row) => row.aid === aid)
			.sort((a, b) => a.at.epochMilliseconds - b.at.epochMilliseconds);
	}
	async insert(rows: VideoMilestoneInsert[]) {
		let inserted = 0;
		for (const row of rows) {
			if (
				this.rows.some(
					(existing) =>
						existing.aid === row.aid &&
						existing.threshold === row.threshold &&
						existing.source === row.source &&
						existing.timeKind === row.timeKind &&
						existing.at.equals(row.at)
				)
			)
				continue;
			this.rows.push({
				...row,
				views: row.views ?? null,
				previousAt: row.previousAt ?? null,
				previousViews: row.previousViews ?? null,
				scheduledAt: row.scheduledAt ?? null,
				requestStartedAt: row.requestStartedAt ?? null,
				note: row.note ?? null,
				recordedAt: row.recordedAt ?? toInstant(new Date(start)),
			});
			inserted++;
		}
		return inserted;
	}
	async prepareRecovery(id: string, minimumViews: number, through: string) {
		this.candidates.set(
			id,
			[...this.samples]
				.filter(([, samples]) =>
					samples.some(
						(sample) =>
							sample.views >= minimumViews &&
							Date.parse(sample.at) <= Date.parse(through)
					)
				)
				.map(([aid]) => aid)
				.sort((a, b) => (a < b ? -1 : 1))
		);
	}
	async nextCandidate(id: string, afterAid: bigint) {
		return this.candidates.get(id)?.find((aid) => aid > afterAid) ?? null;
	}
	async finishRecovery(id: string) {
		this.candidates.delete(id);
	}
	async trace(aid: bigint, from: string, to: string, limit: number, after?: string) {
		return (this.samples.get(aid) ?? [])
			.filter(
				(sample) =>
					Date.parse(sample.at) >= Date.parse(from) &&
					Date.parse(sample.at) <= Date.parse(to) &&
					(!after || Date.parse(sample.at) > Date.parse(after))
			)
			.slice(0, limit);
	}
}

describe("milestone records", () => {
	test("imports an achievement with unknown other metrics and retains its time meaning and source", async () => {
		const service = new MilestoneService(new MemoryMilestones());
		const input = MilestoneImportRequestSchema.parse({
			items: [
				{ aid: "42", threshold: 100000, at: at(0), timeKind: "by", note: "archived post" },
			],
		});
		expect(await service.import(input)).toEqual({ inserted: 1 });
		expect(await service.import(input)).toEqual({ inserted: 0 });
		expect((await service.list("42")).items[0]).toMatchObject({
			aid: "42",
			threshold: 100000,
			timeKind: "by",
			source: "manual",
			views: null,
			previousAt: null,
			note: "archived post",
		});
	});

	test("records every crossed threshold and can add an earlier observation without replacing a manual time", async () => {
		const service = new MilestoneService(new MemoryMilestones());
		await service.import(
			MilestoneImportRequestSchema.parse({
				items: [{ aid: "42", threshold: 100000, at: at(10000), timeKind: "exact" }],
			})
		);
		expect(
			await service.observe(
				42n,
				{ at: at(20000), views: 2000050 },
				{ at: at(0), views: 99999 },
				"live"
			)
		).toBe(3);
		expect(
			await service.observe(42n, { at: at(30000), views: 2000100 }, undefined, "live")
		).toBe(0);
		await service.observe(
			42n,
			{ at: at(15000), views: 100002 },
			{ at: at(0), views: 99999 },
			"history"
		);
		const rows = (await service.list("42")).items;
		expect(rows.filter((row) => row.source === "live").map((row) => row.threshold)).toEqual([
			100000, 1000000, 2000000,
		]);
		expect(rows.find((row) => row.source === "manual")?.at).toBe(
			toInstant(new Date(at(10000))).toString()
		);
		expect(rows.find((row) => row.source === "history")?.previousViews).toBe(99999);
	});

	test("resumes history across batch boundaries and can repeat recovery without duplicating records", async () => {
		const repository = new MemoryMilestones();
		repository.samples.set(42n, [
			{ at: at(0), views: 99980 },
			{ at: at(10000), views: 99999 },
			{ at: at(20000), views: 100010 },
			{ at: at(30000), views: 99990 },
			{ at: at(40000), views: 100020 },
		]);
		const service = new MilestoneService(repository);
		const run = async () => {
			let data = MilestoneRecoveryJobSchema.parse({
				recoveryId: crypto.randomUUID(),
				through: at(60000),
				batchSize: 2,
			});
			for (let step = 0; step < 20; step++) {
				const result = await service.recover(data);
				data = result.data;
				if (result.done) return data;
			}
			throw new Error("Recovery did not finish");
		};
		expect((await run()).processed).toBe(1);
		expect((await run()).inserted).toBe(0);
		const rows = (await service.list("42")).items;
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ threshold: 100000, previousViews: 99999, views: 100010 });
		expect(rows[0]?.at).toBe(toInstant(new Date(at(20000))).toString());
	});
});

describe("milestone replay", () => {
	test("catches the achievement minute with fewer requests than a dense cached trace", () => {
		const samples = Array.from({ length: 181 }, (_, index) => ({
			at: at(index * 5000),
			views: 90000 + Math.floor((index * 5000) / 75000) * 1000,
		}));
		const input = MilestoneBacktestRequestSchema.parse({
			aid: "42",
			threshold: 100000,
			initialState: "new",
			from: at(0),
			to: at(900000),
		});
		const result = replayMilestone(input, samples, start + 750000);
		expect(result.minuteResult).toBe("captured");
		expect(result.requests).toBeLessThan(samples.length);
		expect(result.enteredMilestoneAt).not.toBeNull();
		expect(result.maxTraceGapMs).toBe(5000);
	});
	test("reports a missed minute when execution is delayed and unknown precision for a wide historical gap", () => {
		const samples = [
			{ at: at(0), views: 99990 },
			{ at: at(120000), views: 100010 },
			{ at: at(240000), views: 100020 },
		];
		const input = MilestoneBacktestRequestSchema.parse({
			aid: "42",
			threshold: 100000,
			initialState: "milestone",
			from: at(0),
			to: at(300000),
			executionDelayMs: 180000,
		});
		expect(replayMilestone(input, samples, start + 100000).minuteResult).toBe("missed");
		expect(replayMilestone(input, samples).minuteResult).toBe("unknown");
	});
	test("later growth does not change the earlier scheduling decision", () => {
		const input = MilestoneBacktestRequestSchema.parse({
			aid: "42",
			threshold: 100000,
			initialState: "regular",
			from: at(0),
			to: at(120000),
		});
		const samples = [
			{ at: at(0), views: 1000 },
			{ at: at(1000), views: 99999 },
			{ at: at(2000), views: 100001 },
		];
		const result = replayMilestone(input, samples);
		expect(result.requests).toBe(1);
		expect(result.detectedAt).toBeNull();
	});
});

test("cache analysis recognizes a stable period while retaining the sampling uncertainty", () => {
	const samples = Array.from({ length: 121 }, (_, index) => ({
		at: at(index * 5000),
		views: Math.floor((index * 5000) / 75000) * 100,
	}));
	const input = CacheWindowAnalysisRequestSchema.parse({
		aids: ["42"],
		from: at(0),
		to: at(600000),
	});
	const result = analyzeCacheWindows(input, [{ aid: "42", samples }]);
	expect(result.videos[0]?.bestPeriodMs).toBe(75000);
	expect(result.videos[0]?.maxSampleGapMs).toBe(5000);
	expect(result.videos[0]?.changes).toBe(8);
});

test("hourly observations leave the cache period unresolved", () => {
	const samples = Array.from({ length: 8 }, (_, index) => ({
		at: at(index * 3600000),
		views: index * 100,
	}));
	const input = CacheWindowAnalysisRequestSchema.parse({
		aids: ["42"],
		from: at(0),
		to: at(8 * 3600000),
	});
	const result = analyzeCacheWindows(input, [{ aid: "42", samples }]);
	expect(result.videos[0]?.bestPeriodMs).toBeNull();
	expect(result.sharedPeriodMs).toBeNull();
});
