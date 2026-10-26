import { describe, expect, test } from "bun:test";
import { toInstant, type VideoSnapshot } from "@cvsa/snapshot-db";
import { BilibiliClient } from "../src/crawler/bilibili";
import type {
	CreateSnapshotInput,
	ISnapshotRepository,
} from "../src/crawler/snapshot/repository.interface";
import { SnapshotService } from "../src/crawler/snapshot/service";
import { createTrackingRow, InMemoryTrackingRepository } from "../src/crawler/testing/fakes";

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

/** Seeds the tracking row the way the dispatcher would before a batch runs. */
async function seedDue(repo: InMemoryTrackingRepository, aid: bigint, views: number) {
	repo.trackings.set(
		aid,
		createTrackingRow(aid, {
			nextSnapshotAt: toInstant(new Date(Date.now() - 60_000)),
			// Claimed by the dispatcher a moment ago.
			leaseUntil: toInstant(new Date(Date.now() + 60_000)),
			lastViews: views,
		})
	);
}

function statsClient(payload: unknown): BilibiliClient {
	return new BilibiliClient({
		request: async () => ({
			status: 200,
			headers: {},
			body: JSON.stringify(payload),
		}),
	});
}

describe("SnapshotService", () => {
	test("successfully processes a batch, writes snapshots, and settles the lease", async () => {
		const snapshotRepo = new FakeSnapshotRepository();
		const trackingRepo = new InMemoryTrackingRepository();

		const aid = 12345n;
		await seedDue(trackingRepo, aid, 1_000);

		const client = statsClient({
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
		});

		const service = new SnapshotService(client, snapshotRepo, trackingRepo);
		const result = await service.processBatch([aid]);

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.inserted).toBe(1);
			expect(result.missingCount).toBe(0);
		}

		expect(snapshotRepo.createdSnapshots).toHaveLength(1);
		expect(snapshotRepo.createdSnapshots[0]?.views).toBe(1200);

		const tracking = trackingRepo.trackings.get(aid);
		expect(tracking?.lastViews).toBe(1200);
		expect(tracking?.consecutiveFails).toBe(0);
		// A committed sample releases the lease, clears the error and books the
		// next metadata refresh.
		expect(tracking?.leaseUntil).toBeNull();
		expect(tracking?.lastError).toBeNull();
		expect(tracking?.scheduleReason).toBeDefined();
		expect(tracking?.nextMetadataAt).not.toBeNull();
	});

	test("computes a 24h metadata refresh for a still-new video", async () => {
		const snapshotRepo = new FakeSnapshotRepository();
		const trackingRepo = new InMemoryTrackingRepository();
		const aid = 4242n;
		await seedDue(trackingRepo, aid, 10);
		const seeded = trackingRepo.trackings.get(aid);
		trackingRepo.trackings.set(aid, {
			...(seeded ?? createTrackingRow(aid)),
			state: "new",
		});

		const client = statsClient({
			code: 0,
			message: "0",
			data: [{ id: 4242, cnt_info: { play: 12 } }],
		});
		const before = Date.now();
		const service = new SnapshotService(client, snapshotRepo, trackingRepo);
		await service.processBatch([aid]);

		const tracking = trackingRepo.trackings.get(aid);
		expect(tracking?.scheduleReason).toBe("initial");
		const expected = before + 24 * 60 * 60 * 1_000;
		expect(
			Math.abs((tracking?.nextMetadataAt?.epochMilliseconds ?? 0) - expected)
		).toBeLessThan(5_000);
	});

	test("handles Bilibili API failure by incrementing consecutive fails and backing off", async () => {
		const snapshotRepo = new FakeSnapshotRepository();
		const trackingRepo = new InMemoryTrackingRepository();

		const aid = 67890n;
		await seedDue(trackingRepo, aid, 500);
		const seeded = trackingRepo.trackings.get(aid);
		trackingRepo.trackings.set(aid, {
			...(seeded ?? createTrackingRow(aid)),
			consecutiveFails: 1,
		});

		const client = statsClient({ code: -412, message: "Blocked", data: null });

		const service = new SnapshotService(client, snapshotRepo, trackingRepo);
		const result = await service.processBatch([aid]);

		expect(result.status).toBe("api_error");
		if (result.status === "api_error") {
			expect(result.code).toBe(-412);
		}

		expect(snapshotRepo.createdSnapshots).toHaveLength(0);
		const tracking = trackingRepo.trackings.get(aid);
		expect(tracking?.consecutiveFails).toBe(2);
		expect(tracking?.lastError).toBe("bilibili_api_error:-412");
		expect(tracking?.scheduleReason).toBe("retry");
		expect(tracking?.leaseUntil).toBeNull();
	});

	test("handles videos missing from API response gracefully", async () => {
		const snapshotRepo = new FakeSnapshotRepository();
		const trackingRepo = new InMemoryTrackingRepository();

		const requestedAid1 = 101n;
		const requestedAid2 = 102n;
		await seedDue(trackingRepo, requestedAid1, 200);
		await seedDue(trackingRepo, requestedAid2, 400);

		const client = statsClient({
			code: 0,
			message: "0",
			data: [{ id: 101, cnt_info: { play: 250 } }],
		});

		const service = new SnapshotService(client, snapshotRepo, trackingRepo);
		const result = await service.processBatch([requestedAid1, requestedAid2]);

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.inserted).toBe(1);
			expect(result.missingCount).toBe(1);
		}

		const missing = trackingRepo.trackings.get(requestedAid2);
		expect(missing?.consecutiveFails).toBe(1);
		expect(missing?.lastError).toBe("video_missing_from_stats_response");
		expect(missing?.scheduleReason).toBe("retry");
	});
});
