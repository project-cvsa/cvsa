import { describe, expect, test } from "bun:test";
import {
	type Temporal,
	toInstant,
	type VideoSnapshot,
	type VideoTracking,
} from "@cvsa/snapshot-db";
import { BilibiliClient } from "../src/crawler/bilibili";
import type {
	CreateSnapshotInput,
	ISnapshotRepository,
} from "../src/crawler/snapshot/repository.interface";
import { SnapshotService } from "../src/crawler/snapshot/service";
import type {
	ITrackingRepository,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "../src/crawler/tracking/repository.interface";

class FakeSnapshotRepository implements ISnapshotRepository {
	public createdSnapshots: CreateSnapshotInput[] = [];
	public historicalSnapshots: Map<bigint, VideoSnapshot[]> = new Map();

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<void> {
		this.createdSnapshots.push(...snapshots);
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return (this.historicalSnapshots.get(aid) ?? []).slice(0, limit);
	}
}

class FakeTrackingRepository implements ITrackingRepository {
	public trackings: Map<bigint, VideoTracking> = new Map();
	public updatedSchedules: Array<{ aid: bigint; update: UpdateScheduleInput }> = [];

	async findDueVideos(_limit: number, _beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		return Array.from(this.trackings.values());
	}

	async getTracking(aid: bigint): Promise<VideoTracking | null> {
		return this.trackings.get(aid) ?? null;
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		return aids
			.map((a) => this.trackings.get(a))
			.filter((t): t is VideoTracking => t !== undefined);
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		const record: VideoTracking = {
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
		this.trackings.set(input.aid, record);
		return record;
	}

	async updateSchedule(aid: bigint, update: UpdateScheduleInput): Promise<void> {
		this.updatedSchedules.push({ aid, update });
		const existing = this.trackings.get(aid);
		if (existing) {
			this.trackings.set(aid, {
				...existing,
				...(update.state ? { state: update.state } : {}),
				nextSnapshotAt: update.nextSnapshotAt,
				...(update.lastViews !== undefined ? { lastViews: update.lastViews } : {}),
				...(update.lastCapturedAt !== undefined
					? { lastCapturedAt: update.lastCapturedAt }
					: {}),
				...(update.velocity !== undefined ? { velocity: update.velocity } : {}),
				...(update.targetMilestone !== undefined
					? { targetMilestone: update.targetMilestone }
					: {}),
				...(update.etaHours !== undefined ? { etaHours: update.etaHours } : {}),
				...(update.priority !== undefined ? { priority: update.priority } : {}),
				...(update.consecutiveFails !== undefined
					? { consecutiveFails: update.consecutiveFails }
					: {}),
			});
		}
	}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		for (const aid of aids) {
			const existing = this.trackings.get(aid);
			if (existing) {
				this.trackings.set(aid, {
					...existing,
					nextSnapshotAt,
				});
			}
		}
	}
}

describe("SnapshotService", () => {
	test("successfully processes a batch, writes snapshots, and updates tracking", async () => {
		const fakeSnapshotRepo = new FakeSnapshotRepository();
		const fakeTrackingRepo = new FakeTrackingRepository();

		const aid = 12345n;
		await fakeTrackingRepo.upsertTracking({
			aid,
			state: "regular",
			nextSnapshotAt: toInstant(new Date()),
			lastViews: 1000,
		});

		const bilibiliClient = new BilibiliClient({
			request: async () => ({
				status: 200,
				headers: {},
				body: JSON.stringify({
					code: 0,
					message: "0",
					data: [
						{
							id: 12345,
							cnt_info: {
								play: 1200,
								danmaku: 10,
								reply: 5,
								thumb_up: 50,
								coin: 20,
								share: 2,
								collect: 15,
							},
						},
					],
				}),
			}),
		});

		const service = new SnapshotService(bilibiliClient, fakeSnapshotRepo, fakeTrackingRepo);
		const result = await service.processBatch([aid]);

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.inserted).toBe(1);
			expect(result.missingCount).toBe(0);
		}

		expect(fakeSnapshotRepo.createdSnapshots).toHaveLength(1);
		expect(fakeSnapshotRepo.createdSnapshots[0]?.views).toBe(1200);

		expect(fakeTrackingRepo.updatedSchedules).toHaveLength(1);
		const updated = fakeTrackingRepo.updatedSchedules[0];
		expect(updated).toBeDefined();
		expect(updated?.aid).toBe(aid);
		expect(updated?.update.lastViews).toBe(1200);
		expect(updated?.update.consecutiveFails).toBe(0);
	});

	test("handles Bilibili API failure by incrementing consecutive fails and backing off", async () => {
		const fakeSnapshotRepo = new FakeSnapshotRepository();
		const fakeTrackingRepo = new FakeTrackingRepository();

		const aid = 67890n;
		await fakeTrackingRepo.upsertTracking({
			aid,
			state: "regular",
			nextSnapshotAt: toInstant(new Date()),
			lastViews: 500,
			consecutiveFails: 1,
		});

		const bilibiliClient = new BilibiliClient({
			request: async () => ({
				status: 200,
				headers: {},
				body: JSON.stringify({
					code: -412,
					message: "Blocked",
					data: null,
				}),
			}),
		});

		const service = new SnapshotService(bilibiliClient, fakeSnapshotRepo, fakeTrackingRepo);
		const result = await service.processBatch([aid]);

		expect(result.status).toBe("api_error");
		if (result.status === "api_error") {
			expect(result.code).toBe(-412);
		}

		expect(fakeSnapshotRepo.createdSnapshots).toHaveLength(0);
		expect(fakeTrackingRepo.updatedSchedules).toHaveLength(1);
		const updated = fakeTrackingRepo.updatedSchedules[0];
		expect(updated).toBeDefined();
		expect(updated?.update.consecutiveFails).toBe(2);
	});

	test("handles videos missing from API response gracefully", async () => {
		const fakeSnapshotRepo = new FakeSnapshotRepository();
		const fakeTrackingRepo = new FakeTrackingRepository();

		const requestedAid1 = 101n;
		const requestedAid2 = 102n;

		await fakeTrackingRepo.upsertTracking({
			aid: requestedAid1,
			nextSnapshotAt: toInstant(new Date()),
			lastViews: 200,
		});
		await fakeTrackingRepo.upsertTracking({
			aid: requestedAid2,
			nextSnapshotAt: toInstant(new Date()),
			lastViews: 400,
		});

		// Only returns data for 101, 102 is omitted
		const bilibiliClient = new BilibiliClient({
			request: async () => ({
				status: 200,
				headers: {},
				body: JSON.stringify({
					code: 0,
					message: "0",
					data: [
						{
							id: 101,
							cnt_info: { play: 250 },
						},
					],
				}),
			}),
		});

		const service = new SnapshotService(bilibiliClient, fakeSnapshotRepo, fakeTrackingRepo);
		const result = await service.processBatch([requestedAid1, requestedAid2]);

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.inserted).toBe(1);
			expect(result.missingCount).toBe(1);
		}

		// Aid 102 should have failure incremented
		const update102 = fakeTrackingRepo.updatedSchedules.find((u) => u.aid === requestedAid2);
		expect(update102).toBeDefined();
		expect(update102?.update.consecutiveFails).toBe(1);
	});
});
