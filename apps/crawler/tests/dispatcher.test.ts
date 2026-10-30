import { describe, expect, test } from "bun:test";
import { toInstant } from "@cvsa/snapshot-db";
import {
	createFakeMq,
	createTrackingRow,
	InMemoryTrackingRepository,
} from "../src/crawler/testing/fakes";
import { TrackingDispatcher } from "../src/crawler/tracking/dispatcher";

const LEASE_DURATION_MS = 5 * 60 * 1_000;

function dueRow(aid: number, overrides: Parameters<typeof createTrackingRow>[1] = {}) {
	return createTrackingRow(BigInt(aid), {
		nextSnapshotAt: toInstant(new Date(Date.now() - 60_000)),
		...overrides,
	});
}

describe("TrackingDispatcher", () => {
	test("claims due videos with a lease and never rewrites nextSnapshotAt", async () => {
		const repo = new InMemoryTrackingRepository();
		for (let i = 1; i <= 35; i++) {
			repo.trackings.set(BigInt(i), dueRow(i, { priority: i === 1 ? 1 : 2 }));
		}
		const originalSchedule = new Map(
			[...repo.trackings].map(([aid, row]) => [aid, row.nextSnapshotAt.toString()])
		);

		const fakeMq = createFakeMq();
		const dispatcher = new TrackingDispatcher(repo, fakeMq, { maxPerTick: 100 });

		const now = new Date();
		const count = await dispatcher.tick(now);
		expect(count).toBe(35);

		// Two chunks: 30 + 5
		expect(fakeMq.state.queuedJobs).toHaveLength(2);
		expect(fakeMq.state.queuedJobs[0]?.queue).toBe("snapshot-batch");
		const batch1 = fakeMq.state.queuedJobs[0]?.data as { aids: string[] };
		const batch2 = fakeMq.state.queuedJobs[1]?.data as { aids: string[] };
		expect(batch1.aids).toHaveLength(30);
		expect(batch2.aids).toHaveLength(5);

		// The schedule is untouched; only the lease moved forward.
		for (const [aid, row] of repo.trackings) {
			expect(row.nextSnapshotAt.toString()).toBe(originalSchedule.get(aid) ?? "");
			expect(row.leaseUntil).not.toBeNull();
			expect(row.leaseUntil?.epochMilliseconds).toBe(now.getTime() + LEASE_DURATION_MS);
		}
	});

	test("does not re-dispatch videos whose lease is still in flight", async () => {
		const repo = new InMemoryTrackingRepository();
		repo.trackings.set(1n, dueRow(1));

		const fakeMq = createFakeMq();
		const dispatcher = new TrackingDispatcher(repo, fakeMq);

		expect(await dispatcher.tick(new Date())).toBe(1);
		// Second tick one second later: the lease from the first tick still holds.
		expect(await dispatcher.tick(new Date())).toBe(0);
		expect(fakeMq.state.queuedJobs).toHaveLength(1);
	});

	test("re-claims a video once its lease expires", async () => {
		const repo = new InMemoryTrackingRepository();
		const dueAt = toInstant(new Date(Date.now() - 60_000));
		repo.trackings.set(
			1n,
			createTrackingRow(1n, {
				nextSnapshotAt: dueAt,
				// Expired five seconds ago.
				leaseUntil: toInstant(new Date(Date.now() - 5_000)),
			})
		);

		const fakeMq = createFakeMq();
		const dispatcher = new TrackingDispatcher(repo, fakeMq);

		expect(await dispatcher.tick(new Date())).toBe(1);
	});

	test("stops pulling from the database when the queue is at its cap", async () => {
		const repo = new InMemoryTrackingRepository();
		for (let i = 1; i <= 10; i++) repo.trackings.set(BigInt(i), dueRow(i));

		const fakeMq = createFakeMq();
		// queueCap defaults to 200: active + waiting already sit at the ceiling.
		fakeMq.state.jobCounts = { waiting: 150, active: 50, delayed: 0, failed: 0, completed: 0 };

		const dispatcher = new TrackingDispatcher(repo, fakeMq, { queueCap: 200 });
		expect(dispatcher.queueCap).toBe(200);

		expect(await dispatcher.tick(new Date())).toBe(0);
		expect(fakeMq.state.queuedJobs).toHaveLength(0);
		// Nothing was leased either, so the videos stay visible in the backlog.
		for (const row of repo.trackings.values()) expect(row.leaseUntil).toBeNull();
	});

	test("never exceeds available job slots and leaves excess videos unleased", async () => {
		const repo = new InMemoryTrackingRepository();
		const videoCount = 400;
		for (let i = 1; i <= videoCount; i++) repo.trackings.set(BigInt(i), dueRow(i));
		const fakeMq = createFakeMq();
		const queueCap = 8;
		const occupied = { waiting: 2, active: 1, delayed: 2, failed: 0, completed: 0 };
		fakeMq.state.jobCounts = occupied;
		const freeSlots = queueCap - occupied.waiting - occupied.active - occupied.delayed;
		const dispatcher = new TrackingDispatcher(repo, fakeMq, {
			queueCap,
			maxPerTick: videoCount,
		});
		const dispatched = await dispatcher.tick(new Date());
		expect(fakeMq.state.queuedJobs).toHaveLength(freeSlots);
		const leased = [...repo.trackings.values()].filter((row) => row.leaseUntil !== null);
		expect(dispatched).toBe(leased.length);
		expect(dispatched).toBeGreaterThan(0);
		expect(dispatched).toBeLessThan(videoCount);
		expect([...repo.trackings.values()].filter((row) => row.leaseUntil === null)).toHaveLength(
			videoCount - dispatched
		);
	});

	test("does nothing when no videos are due", async () => {
		const repo = new InMemoryTrackingRepository();
		const fakeMq = createFakeMq();
		repo.trackings.set(
			1n,
			createTrackingRow(1n, { nextSnapshotAt: toInstant(new Date(Date.now() + 60_000)) })
		);

		const dispatcher = new TrackingDispatcher(repo, fakeMq);
		expect(await dispatcher.tick(new Date())).toBe(0);
		expect(fakeMq.state.queuedJobs).toHaveLength(0);
	});
});
