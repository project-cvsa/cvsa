import { describe, expect, test } from "bun:test";
import { type Temporal, toInstant, type VideoTracking } from "@cvsa/snapshot-db";
import { createFakeMq } from "../src/crawler/testing/fakes";
import { TrackingDispatcher } from "../src/crawler/tracking/dispatcher";
import type {
	ITrackingRepository,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "../src/crawler/tracking/repository.interface";

class FakeDispatcherTrackingRepository implements ITrackingRepository {
	public dueVideos: VideoTracking[] = [];
	public postponedAids: Array<{ aids: bigint[]; nextSnapshotAt: Temporal.Instant }> = [];

	async findDueVideos(_limit: number, _beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		return this.dueVideos;
	}

	async getTracking(_aid: bigint): Promise<VideoTracking | null> {
		return null;
	}

	async getTrackings(_aids: bigint[]): Promise<VideoTracking[]> {
		return [];
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		return {
			aid: input.aid,
			state: input.state ?? "regular",
			nextSnapshotAt: input.nextSnapshotAt,
			lastViews: input.lastViews ?? 0,
			lastCapturedAt: input.lastCapturedAt ?? null,
			velocity: input.velocity ?? 0,
			targetMilestone: input.targetMilestone ?? null,
			etaHours: input.etaHours ?? null,
			publishedAt: input.publishedAt ?? null,
			priority: input.priority ?? 2,
			consecutiveFails: input.consecutiveFails ?? 0,
			updatedAt: input.nextSnapshotAt,
		};
	}

	async updateSchedule(_aid: bigint, _update: UpdateScheduleInput): Promise<void> {}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		this.postponedAids.push({ aids, nextSnapshotAt });
	}
}

describe("TrackingDispatcher", () => {
	test("dispatches due videos in chunks of 30 and leases them forward", async () => {
		const fakeRepo = new FakeDispatcherTrackingRepository();
		const fakeMq = createFakeMq();

		// Create 35 due videos (should produce 2 batches: 30 and 5)
		const nowInstant = toInstant(new Date());
		for (let i = 1; i <= 35; i++) {
			fakeRepo.dueVideos.push({
				aid: BigInt(i),
				state: "regular",
				nextSnapshotAt: nowInstant,
				lastViews: 100 * i,
				lastCapturedAt: nowInstant,
				velocity: 10,
				targetMilestone: null,
				etaHours: null,
				publishedAt: null,
				priority: i === 1 ? 1 : 2,
				consecutiveFails: 0,
				updatedAt: nowInstant,
			});
		}

		const dispatcher = new TrackingDispatcher(fakeRepo, fakeMq, {
			maxPerTick: 100,
		});

		const count = await dispatcher.tick(new Date());
		expect(count).toBe(35);

		// Postponed aids should include all 35 videos
		expect(fakeRepo.postponedAids).toHaveLength(1);
		expect(fakeRepo.postponedAids[0]?.aids).toHaveLength(35);

		// Queued jobs should be 2 batches
		expect(fakeMq.state.queuedJobs).toHaveLength(2);
		expect(fakeMq.state.queuedJobs[0]?.queue).toBe("snapshot-batch");
		const batch1 = fakeMq.state.queuedJobs[0]?.data as { aids: string[] };
		const batch2 = fakeMq.state.queuedJobs[1]?.data as { aids: string[] };

		expect(batch1.aids).toHaveLength(30);
		expect(batch2.aids).toHaveLength(5);
	});

	test("does nothing when no videos are due", async () => {
		const fakeRepo = new FakeDispatcherTrackingRepository();
		const fakeMq = createFakeMq();
		fakeRepo.dueVideos = [];

		const dispatcher = new TrackingDispatcher(fakeRepo, fakeMq);
		const count = await dispatcher.tick(new Date());

		expect(count).toBe(0);
		expect(fakeRepo.postponedAids).toHaveLength(0);
		expect(fakeMq.state.queuedJobs).toHaveLength(0);
	});
});
