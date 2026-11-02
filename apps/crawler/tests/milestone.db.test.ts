import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	createSnapshotDb,
	videoSnapshot,
	videoTracking,
	videoMilestone,
	toInstant,
} from "@cvsa/snapshot-db";
import { MilestoneRepository } from "../src/crawler/milestone/repository";
import { MilestoneService } from "../src/crawler/milestone/service";
import { SnapshotService } from "../src/crawler/snapshot/service";
import { SnapshotRepository } from "../src/crawler/snapshot/repository";
import { TrackingRepository } from "../src/crawler/tracking/repository";
import { BilibiliClient } from "../src/crawler/bilibili";
import { databaseTransaction } from "../src/crawler/shared/databaseContext";
import { createCrawlerMq } from "../src/crawler/shared/mq";
import {
	createSnapshotBatchWorker,
	SNAPSHOT_BATCH_QUEUE,
	type SnapshotBatchJobData,
} from "../src/crawler/snapshot/worker";
import { waitUntil } from "./support/async";

const db = createSnapshotDb();
const ids = [
	9190000000000001n,
	9190000000000002n,
	9190000000000003n,
	9190000000000004n,
	9190000000000005n,
];
const milestoneRepo = new MilestoneRepository(db.client);
const milestones = new MilestoneService(milestoneRepo);
const snapshots = new SnapshotRepository(db.client);
const tracking = new TrackingRepository(db.client);

async function clear() {
	await db.client.delete(videoMilestone).where(inArray(videoMilestone.aid, ids));
	await db.client.delete(videoSnapshot).where(inArray(videoSnapshot.aid, ids));
	await db.client.delete(videoTracking).where(inArray(videoTracking.aid, ids));
}
beforeAll(async () => {
	await db.connect();
	await clear();
});
afterAll(async () => {
	await clear();
	await db.disconnect();
});

function client(aid: bigint, views: number) {
	return new BilibiliClient({
		request: async () => ({
			status: 200,
			headers: {},
			body: JSON.stringify({
				code: 0,
				data: [{ id: String(aid), cnt_info: { play: views } }],
			}),
		}),
	});
}

describe("persisted milestone collection", () => {
	test("a partial batch keeps the same queue job and retries only the missing milestone video", async () => {
		const first = 9190000000000004n;
		const second = 9190000000000005n;
		const mq = createCrawlerMq(undefined, `milestone-retry-${crypto.randomUUID()}`);
		const queue = mq.createQueue<SnapshotBatchJobData>(SNAPSHOT_BATCH_QUEUE);
		const gate = Promise.withResolvers<void>();
		const secondStarted = Promise.withResolvers<void>();
		const resources: string[] = [];
		const live = new BilibiliClient({
			request: async (url) => {
				resources.push(new URL(url).searchParams.get("resources") ?? "");
				if (resources.length === 2) {
					secondStarted.resolve();
					await gate.promise;
				}
				return {
					status: 200,
					headers: {},
					body: JSON.stringify({
						code: 0,
						data: [
							{
								id: String(resources.length === 1 ? first : second),
								cnt_info: { play: 100010 },
							},
						],
					}),
				};
			},
		});
		const due = new Date(Date.now() - 1000);
		const until = new Date(Date.now() + 300000).toISOString();
		for (const aid of [first, second])
			await tracking.upsertTracking({
				aid,
				state: "milestone",
				priority: 1,
				targetMilestone: 100000,
				nextSnapshotAt: toInstant(due),
				leaseUntil: toInstant(new Date(until)),
			});
		const service = new SnapshotService(live, snapshots, tracking);
		service.configure({ milestoneRetryMs: 100 });
		try {
			await mq.connect();
			createSnapshotBatchWorker(mq, service);
			await queue.add(
				"batch",
				{
					aids: [String(first), String(second)],
					leaseUntil: until,
					dueAt: due.toISOString(),
					priority: 1,
				},
				{ jobId: "original", priority: 1, attempts: 1, removeOnComplete: false }
			);
			await secondStarted.promise;
			const active = await queue.getJobDetail("original");
			expect(active?.data).toMatchObject({
				aids: [String(second)],
				dueAt: due.toISOString(),
				priority: 1,
			});
			expect(resources[1]).toBe(`${second}:2`);
			expect((await tracking.getTracking(first))?.leaseUntil).toBeNull();
			expect((await tracking.getTracking(second))?.nextSnapshotAt.toString()).toBe(
				toInstant(due).toString()
			);
			gate.resolve();
			await waitUntil(
				async () => (await queue.getJobCounts()).completed === 1,
				"retained tracking job completion"
			);
			expect((await queue.getJobCounts()).failed).toBe(0);
		} finally {
			gate.resolve();
			await mq.close();
		}
	});
	test("a regular video crossing a target stores its achievement together with the sample", async () => {
		const aid = 9190000000000001n;
		const dueAt = new Date(Date.now() - 2000);
		await tracking.upsertTracking({
			aid,
			state: "regular",
			nextSnapshotAt: toInstant(dueAt),
			lastViews: 99990,
			lastCapturedAt: toInstant(new Date(Date.now() - 75000)),
		});
		const service = new SnapshotService(
			client(aid, 100010),
			snapshots,
			tracking,
			undefined,
			milestones,
			(work) => databaseTransaction(db.client, work)
		);
		await service.processBatch([aid], undefined, dueAt.toISOString());
		const result = await milestones.list(String(aid));
		expect(result.achievements).toHaveLength(1);
		expect(result.items[0]).toMatchObject({
			threshold: 100000,
			previousViews: 99990,
			views: 100010,
			source: "live",
		});
		expect(result.items[0]?.scheduledAt).toBe(toInstant(dueAt).toString());
		expect((await snapshots.listSnapshots(aid, { offset: 0, limit: 10 })).total).toBe(1);
	});

	test("a failed persistence transaction leaves both the sample and achievement unwritten", async () => {
		const aid = 9190000000000002n;
		await tracking.upsertTracking({
			aid,
			nextSnapshotAt: toInstant(new Date()),
			lastViews: 99990,
		});
		const service = new SnapshotService(
			client(aid, 100010),
			snapshots,
			tracking,
			undefined,
			milestones,
			(work) =>
				databaseTransaction(db.client, async () => {
					await work();
					throw new Error("Persistence failed");
				})
		);
		await expect(service.processBatch([aid])).rejects.toThrow("Persistence failed");
		expect((await milestones.list(String(aid))).items).toHaveLength(0);
		expect((await snapshots.listSnapshots(aid, { offset: 0, limit: 10 })).total).toBe(0);
		expect((await tracking.getTracking(aid))?.lastViews).toBe(99990);
	});

	test("repeated cached counts retain older growth information for milestone scheduling", async () => {
		const aid = 9190000000000003n;
		const now = Date.now();
		await snapshots.createSnapshots(
			Array.from({ length: 20 }, (_, index) => ({
				aid,
				capturedAt: toInstant(new Date(now - 240000 + index * 10000)),
				views: index < 13 ? 99000 : 99990,
				coins: 0,
				likes: 0,
				favorites: 0,
				shares: 0,
				danmakus: 0,
				replies: 0,
			}))
		);
		await tracking.upsertTracking({
			aid,
			state: "milestone",
			targetMilestone: 100000,
			nextSnapshotAt: toInstant(new Date(now)),
			lastViews: 99990,
			lastCapturedAt: toInstant(new Date(now - 10000)),
		});
		await new SnapshotService(client(aid, 99990), snapshots, tracking).processBatch([aid]);
		const row = await tracking.getTracking(aid);
		expect(row?.state).toBe("milestone");
		expect(row?.targetMilestone).toBe(100000);
		expect((row?.nextSnapshotAt.epochMilliseconds ?? Infinity) - Date.now()).toBeLessThan(
			60000
		);
	});

	test("historical candidates include videos no longer present in tracking", async () => {
		const aid = 9190000000000001n;
		await db.client.delete(videoTracking).where(eq(videoTracking.aid, aid));
		const id = crypto.randomUUID();
		try {
			await milestoneRepo.prepareRecovery(id, 100000, new Date().toISOString());
			expect(await milestoneRepo.nextCandidate(id, aid - 1n)).toBe(aid);
		} finally {
			await milestoneRepo.finishRecovery(id);
		}
	});
});
