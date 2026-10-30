import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DiscoveryContextSchema } from "@cvsa/contracts";
import { createSnapshotDb, toInstant, type SnapshotDb } from "@cvsa/snapshot-db";
import { DiscoveryRepository } from "../src/crawler/discovery/repository";
import type { UpsertMetadataInput } from "../src/crawler/discovery/types";
import { TrackingRepository } from "../src/crawler/tracking/repository";

/**
 * Integration tests for the crawler repositories.
 *
 * These run against the crawler's own test database (`SNAPSHOT_DATABASE_URL`,
 * `cvsa_snapshot_test` under `NODE_ENV=test`) because the behaviour under test —
 * lease compare-and-set, aggregate counts, JSON history rows, `LIKE`/`NOT IN`
 * filters — only exists in the generated SQL.
 */

const BASE_AID = 900_000_000_000_001n;

let snapshotDb: SnapshotDb;
let tracking: TrackingRepository;
let discovery: DiscoveryRepository;
const touchedAids: bigint[] = [];

function aid(offset: number): bigint {
	const value = BASE_AID + BigInt(offset);
	touchedAids.push(value);
	return value;
}

function instant(offsetMs: number): ReturnType<typeof toInstant> {
	return toInstant(new Date(Date.now() + offsetMs));
}

async function cleanup(): Promise<void> {
	const aids = [...new Set(touchedAids)];
	if (aids.length === 0) return;
	const client = snapshotDb.client;
	for await (const _ of client.orm.public.BilibiliVideoMetadataHistory.where((row) =>
		row.aid.in(aids)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.BilibiliVideoMetadata.where((row) =>
		row.aid.in(aids)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.BilibiliVideoRelation.where((row) =>
		row.sourceAid.in(aids)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.DiscoverySample.where((row) =>
		row.aid.in(aids)
	).deleteAll()) {
		// drained
	}
	for await (const _ of client.orm.public.VideoTracking.where((row) =>
		row.aid.in(aids)
	).deleteAll()) {
		// drained
	}
}

beforeAll(async () => {
	snapshotDb = createSnapshotDb();
	await snapshotDb.connect();
	tracking = new TrackingRepository(snapshotDb.client);
	discovery = new DiscoveryRepository(snapshotDb.client);
	await cleanup();
});

afterAll(async () => {
	await cleanup();
	await snapshotDb.disconnect();
});

describe("TrackingRepository", () => {
	test("claimDueVideos leases rows without rewriting the schedule", async () => {
		const leasedAid = aid(1);
		const dueAt = instant(-60_000);
		await tracking.upsertTracking({ aid: leasedAid, nextSnapshotAt: dueAt, priority: 2 });

		const now = instant(0);
		const claimed = await tracking.claimDueVideos(now, 10, 5 * 60_000);
		expect(claimed.map((row) => row.aid)).toContain(leasedAid);

		const stored = await tracking.getTracking(leasedAid);
		expect(stored?.nextSnapshotAt.toString()).toBe(dueAt.toString());
		expect(stored?.leaseUntil).not.toBeNull();

		// The lease blocks a second claim until it expires.
		const second = await tracking.claimDueVideos(instant(1_000), 10, 5 * 60_000);
		expect(second.map((row) => row.aid)).not.toContain(leasedAid);

		// Once expired it is claimable again.
		const afterExpiry = await tracking.claimDueVideos(instant(6 * 60_000), 10, 5 * 60_000);
		expect(afterExpiry.map((row) => row.aid)).toContain(leasedAid);
	});

	test("findDueVideos hides leased rows and releaseLeases restores them", async () => {
		const blockedAid = aid(2);
		await tracking.upsertTracking({
			aid: blockedAid,
			nextSnapshotAt: instant(-60_000),
			leaseUntil: instant(60_000),
		});

		const due = await tracking.findDueVideos(50, instant(0));
		expect(due.map((row) => row.aid)).not.toContain(blockedAid);

		await tracking.releaseLeases([blockedAid]);
		const afterRelease = await tracking.findDueVideos(50, instant(0));
		expect(afterRelease.map((row) => row.aid)).toContain(blockedAid);
	});

	test("countOverdueVideos reports the count and the worst lag", async () => {
		const overdueAid = aid(3);
		await tracking.upsertTracking({
			aid: overdueAid,
			nextSnapshotAt: instant(-120_000),
		});

		const summary = await tracking.countOverdueVideos(instant(0));
		expect(summary.overdueCount).toBeGreaterThanOrEqual(1);
		expect(summary.maxOverdueLagSec).toBeGreaterThanOrEqual(120);
	});

	test("updateSchedule persists reason, metadata deadline, and clears the lease", async () => {
		const updatedAid = aid(4);
		await tracking.upsertTracking({
			aid: updatedAid,
			nextSnapshotAt: instant(-60_000),
			leaseUntil: instant(60_000),
			lastError: "boom",
		});

		const nextMetadataAt = instant(24 * 60 * 60 * 1_000);
		await tracking.updateSchedule(updatedAid, {
			state: "new",
			nextSnapshotAt: instant(60_000),
			scheduleReason: "initial",
			nextMetadataAt,
			leaseUntil: null,
			lastError: null,
			consecutiveFails: 0,
			velocity: 12.5,
		});

		const stored = await tracking.getTracking(updatedAid);
		expect(stored?.state).toBe("new");
		expect(stored?.scheduleReason).toBe("initial");
		expect(stored?.nextMetadataAt?.toString()).toBe(nextMetadataAt.toString());
		expect(stored?.leaseUntil).toBeNull();
		expect(stored?.lastError).toBeNull();
		expect(stored?.velocity).toBeCloseTo(12.5, 5);
	});

	test("listTrackingVideos filters by state, search term, and paginates", async () => {
		const first = aid(5);
		const second = aid(6);
		await tracking.upsertTracking({ aid: first, nextSnapshotAt: instant(0), state: "new" });
		await tracking.upsertTracking({
			aid: second,
			nextSnapshotAt: instant(0),
			state: "archive",
		});
		await discovery.upsertMetadata({
			aid: first,
			bvid: "BV1xx411c7mD",
			title: "洛天依原创 唯一标题",
		});

		const byState = await tracking.listTrackingVideos({
			limit: 50,
			offset: 0,
			state: "archive",
		});
		expect(byState.items.some((row) => row.aid === second)).toBe(true);
		expect(byState.items.some((row) => row.aid === first)).toBe(false);

		const byTitle = await tracking.listTrackingVideos({
			limit: 50,
			offset: 0,
			search: "唯一标题",
		});
		expect(byTitle.items.map((row) => row.aid)).toEqual([first]);

		const byBvid = await tracking.listTrackingVideos({
			limit: 20,
			offset: 0,
			search: "BV1xx411c7mD",
		});
		expect(byBvid.items.map((row) => row.aid)).toEqual([first]);
		await snapshotDb.client.orm.public.VideoTracking.where({ aid: first }).update({
			lastViews: 100,
		});
		await snapshotDb.client.orm.public.VideoTracking.where({ aid: second }).update({
			lastViews: 10,
		});
		const byViews = await tracking.listTrackingVideos({
			limit: 200,
			offset: 0,
			sortBy: "views",
			sortOrder: "desc",
		});
		expect(byViews.items.findIndex((row) => row.aid === first)).toBeLessThan(
			byViews.items.findIndex((row) => row.aid === second)
		);

		const byAid = await tracking.listTrackingVideos({
			limit: 50,
			offset: 0,
			search: first.toString(),
		});
		expect(byAid.items.map((row) => row.aid)).toEqual([first]);

		const page1 = await tracking.listTrackingVideos({ limit: 1, offset: 0 });
		const page2 = await tracking.listTrackingVideos({ limit: 1, offset: 1 });
		expect(page1.items).toHaveLength(1);
		expect(page2.items).toHaveLength(1);
		expect(page1.total).toBe(page2.total);
		expect(page1.items[0]?.aid).not.toBe(page2.items[0]?.aid);
	});
});

describe("DiscoveryRepository metadata history", () => {
	function input(targetAid: bigint, overrides: Partial<UpsertMetadataInput> = {}) {
		return {
			aid: targetAid,
			bvid: `BV${targetAid}`,
			title: "初始标题",
			description: "初始简介",
			duration: 200,
			...overrides,
		} satisfies UpsertMetadataInput;
	}

	test("writes a created row then only the fields that changed", async () => {
		const target = aid(10);
		await discovery.upsertMetadata(input(target));

		let history = await discovery.getMetadataHistory(target);
		expect(history).toHaveLength(1);
		expect(history[0]?.changeType).toBe("created");

		// Re-persisting the identical payload must not create noise.
		await discovery.upsertMetadata(input(target));
		history = await discovery.getMetadataHistory(target);
		expect(history).toHaveLength(1);

		await discovery.upsertMetadata(input(target, { title: "新标题" }));
		history = await discovery.getMetadataHistory(target);
		expect(history).toHaveLength(2);
		expect(history[0]?.changeType).toBe("updated");
		expect(history[0]?.changedFields).toEqual({
			title: { old: "初始标题", new: "新标题" },
		});
	});

	test("classifies a takedown as status_changed and keeps the snapshot", async () => {
		const target = aid(11);
		await discovery.upsertMetadata(input(target));
		await discovery.upsertMetadata(input(target, { videoStatus: "deleted" }));

		const history = await discovery.getMetadataHistory(target);
		expect(history[0]?.changeType).toBe("status_changed");
		expect(history[0]?.changedFields).toEqual({
			videoStatus: { old: "normal", new: "deleted" },
		});
		const snapshot = history[0]?.snapshot;
		expect(snapshot && typeof snapshot === "object" && "videoStatus" in snapshot).toBe(true);
	});

	test("bulkUpsertMetadata never downgrades an existing row", async () => {
		const target = aid(12);
		await discovery.upsertMetadata(
			input(target, {
				pages: [{ cid: 1 }],
				staff: [{ mid: 1 }],
				tags: [{ name: "洛天依" }],
				videoStatus: "private",
			})
		);

		await discovery.bulkUpsertMetadata([
			input(target, { title: "浅层标题", duration: 0 }),
			input(aid(13), { title: "全新视频" }),
		]);

		const preserved = await discovery.getMetadata(target);
		expect(preserved?.title).toBe("初始标题");
		expect(preserved?.videoStatus).toBe("private");
		expect(preserved?.pages).toEqual([{ cid: 1 }]);

		const created = await discovery.getMetadata(BASE_AID + 13n);
		expect(created?.title).toBe("全新视频");
	});

	test("keeps the first origin while the decision follows the latest evaluation", async () => {
		const target = aid(14);
		await discovery.upsertMetadata(
			input(target, {
				discoverySource: "search",
				discoveryContext: {
					origin: {
						channel: "search",
						capturedAt: "2026-10-30T00:00:00.000Z",
						search: {
							keyword: "洛天依原创",
							order: "pubdate",
							page: 1,
							position: 3,
						},
					},
				},
			})
		);

		await discovery.upsertMetadata(
			input(target, {
				discoverySource: "manual",
				discoveryContext: {
					origin: {
						channel: "manual",
						capturedAt: "2026-10-31T00:00:00.000Z",
						manual: { action: "ingest" },
					},
					decision: {
						outcome: "accepted",
						basis: "model",
						reason: "model_accept",
						confidence: 0.93,
						sampled: false,
					},
				},
			})
		);

		const stored = await discovery.getMetadata(target);
		expect(stored?.discoverySource).toBe("search");
		const context = DiscoveryContextSchema.parse(stored?.discoveryContext);
		expect(context.origin.channel).toBe("search");
		expect(context.origin.search?.keyword).toBe("洛天依原创");
		expect(context.decision?.reason).toBe("model_accept");
	});
});

describe("DiscoveryRepository samples", () => {
	async function sample(
		offset: number,
		decision: "whitelist" | "model_accepted" | "model_rejected",
		humanLabel: number | null
	) {
		const sampleAid = aid(offset);
		await discovery.upsertSample({
			aid: sampleAid,
			bvid: `BV${sampleAid}`,
			title: `sample ${offset}`,
			decision,
			modelVersion: "akari-3.17",
			probabilities: [0.1, 0.9],
			songProbability: 0.9,
		});
		if (humanLabel !== null) await discovery.labelSample(sampleAid, humanLabel);
		return sampleAid;
	}

	test("combines source, confidence and title filters before ordering and counting", async () => {
		const first = await sample(50, "model_rejected", null);
		const second = await sample(51, "model_rejected", null);
		await discovery.upsertMetadata({
			aid: first,
			bvid: `BV${first}`,
			title: "sample 50",
			duration: 100,
			discoverySource: "search",
		});
		await discovery.upsertMetadata({
			aid: second,
			bvid: `BV${second}`,
			title: "sample 51",
			duration: 100,
			discoverySource: "related",
		});
		const query = {
			source: "related",
			minConfidence: 0.8,
			search: "sample 5",
			limit: 1,
			offset: 0,
			sortBy: "confidence",
			sortOrder: "asc",
		} satisfies import("@cvsa/contracts").DiscoverySampleListQuery;
		expect((await discovery.listSamples(query)).map((row) => row.aid)).toEqual([second]);
		expect(await discovery.countSamples(query)).toBe(1);
		expect(await discovery.countSamples({ ...query, minConfidence: 0.95 })).toBe(0);
	});

	test("applies the labeled filter before paginating", async () => {
		const unlabeledA = await sample(20, "model_rejected", null);
		const unlabeledB = await sample(21, "model_rejected", null);
		const labeled = await sample(22, "model_rejected", 1);

		const unlabeled = await discovery.listSamples({
			decision: "model_rejected",
			labeled: false,
			limit: 50,
		});
		const unlabeledAids = unlabeled.map((row) => row.aid);
		expect(unlabeledAids).toContain(unlabeledA);
		expect(unlabeledAids).toContain(unlabeledB);
		expect(unlabeledAids).not.toContain(labeled);

		const gotLabeled = await discovery.listSamples({ labeled: true, limit: 50 });
		expect(gotLabeled.map((row) => row.aid)).toContain(labeled);

		// A page of one must not come back empty just because the first row in
		// the unfiltered order was labelled.
		const firstPage = await discovery.listSamples({ labeled: false, limit: 1, offset: 0 });
		expect(firstPage).toHaveLength(1);
		expect(firstPage[0]?.humanLabel).toBeNull();

		const secondPage = await discovery.listSamples({ labeled: false, limit: 1, offset: 1 });
		expect(secondPage).toHaveLength(1);
		expect(secondPage[0]?.aid).not.toBe(firstPage[0]?.aid);
	});
});

describe("DiscoveryRepository hot sampling", () => {
	test("returns fast videos and honours the recommendation cooldown", async () => {
		const hot = aid(30);
		const recentlySampled = aid(31);
		await tracking.upsertTracking({
			aid: hot,
			nextSnapshotAt: instant(0),
			velocity: 120,
		});
		await tracking.upsertTracking({
			aid: recentlySampled,
			nextSnapshotAt: instant(0),
			velocity: 500,
		});

		await discovery.saveRelations([
			{
				sourceAid: recentlySampled,
				targetAid: hot,
				position: 0,
				capturedAt: instant(-60_000),
			},
		]);

		const seeds = await discovery.listHotSampleCandidates({
			limit: 50,
			cooldownMinutes: 60,
			now: instant(0),
		});
		expect(seeds).toContain(hot);
		expect(seeds).not.toContain(recentlySampled);
	});
});

test("stale snapshot leases cannot change or release a newer claim", async () => {
	const target = aid(900);
	const oldLease = instant(10_000);
	const newLease = instant(20_000);
	const next = instant(30_000);
	await tracking.upsertTracking({ aid: target, nextSnapshotAt: next, leaseUntil: newLease });
	await tracking.updateSchedule(
		target,
		{ nextSnapshotAt: instant(40_000), leaseUntil: null },
		oldLease
	);
	await tracking.releaseLeases([target], oldLease);
	const row = await tracking.getTracking(target);
	expect(row?.leaseUntil?.epochMilliseconds).toBe(newLease.epochMilliseconds);
	expect(row?.nextSnapshotAt.epochMilliseconds).toBe(next.epochMilliseconds);
	await tracking.updateSchedule(target, { leaseUntil: null }, newLease);
	expect((await tracking.getTracking(target))?.leaseUntil).toBeNull();
});
