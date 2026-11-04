import { AppError } from "@cvsa/contracts";
import { snapshotFailureKind } from "../src/crawler/snapshot/worker";
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

	async createSnapshots(snapshots: CreateSnapshotInput[]): Promise<number> {
		this.createdSnapshots.push(...snapshots);
		return snapshots.length;
	}

	async getRecentSnapshots(aid: bigint, limit = 10): Promise<VideoSnapshot[]> {
		return (this.historicalSnapshots.get(aid) ?? []).slice(0, limit);
	}
	async getFirstSnapshot(aid: bigint): Promise<VideoSnapshot | null> {
		return (
			[...(this.historicalSnapshots.get(aid) ?? [])].sort(
				(a, b) => a.capturedAt.epochMilliseconds - b.capturedAt.epochMilliseconds
			)[0] ?? null
		);
	}
	async getSchedulingHistory(aid: bigint): Promise<VideoSnapshot[]> {
		return this.getRecentSnapshots(aid);
	}

	async listSnapshots(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: VideoSnapshot[]; total: number }> {
		const all = this.historicalSnapshots.get(aid) ?? [];
		return {
			items: all.slice(options.offset, options.offset + options.limit),
			total: all.length,
		};
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

describe("snapshot failure handling", () => {
	test("classifies throttling separately from unavailable exits and other errors", () => {
		expect(snapshotFailureKind(new Error("Bilibili request failed with HTTP 412"))).toBe(
			"rate_limit"
		);
		expect(snapshotFailureKind(new Error("Bilibili request failed with HTTP 429"))).toBe(
			"rate_limit"
		);
		expect(snapshotFailureKind(new AppError("No adapter", "NO_AVAILABLE_ADAPTER", 503))).toBe(
			"unavailable"
		);
		expect(snapshotFailureKind(new Error("HTTP 500"))).toBe("other");
	});
});

describe("SnapshotService", () => {
	test("a repeatedly missing video stops retrying when details confirm it was deleted", async () => {
		const repo = new InMemoryTrackingRepository();
		await seedDue(repo, 42n, 99990);
		await repo.updateSchedule(42n, {
			state: "milestone",
			priority: 1,
			consecutiveFails: 1,
			lastError: "video_missing_from_stats_response",
		});
		const client = new BilibiliClient({
			request: async (url, options) => {
				const body = url.includes("finger/spi")
					? { code: 0, data: { b_3: "device3", b_4: "device4" } }
					: url.includes("GenWebTicket")
						? {
								code: 0,
								data: {
									ticket: "ticket",
									nav: { img: "a".repeat(32), sub: "b".repeat(32) },
								},
							}
						: url.includes("view/detail")
							? { code: -404, message: "Video deleted" }
							: { code: 0, data: [] };
				return {
					status: 200,
					headers: {},
					body: options?.method === "HEAD" ? "" : JSON.stringify(body),
				};
			},
		});
		const result = await new SnapshotService(
			client,
			new FakeSnapshotRepository(),
			repo
		).processBatch([42n]);
		expect(result.status).toBe("success");
		if (result.status !== "success") throw new Error("Expected a settled missing video");
		expect(result.retryAids).toEqual([]);
		expect((await repo.getTracking(42n))?.state).toBe("archive");
		expect((await repo.getTracking(42n))?.leaseUntil).toBeNull();
	});
	test("retains a milestone job ownership and original due time while retrying", async () => {
		const repo = new InMemoryTrackingRepository();
		await seedDue(repo, 12n, 0);
		const service = new SnapshotService(statsClient({}), new FakeSnapshotRepository(), repo);
		const original = await repo.getTracking(12n);
		await repo.updateSchedule(12n, { state: "milestone", priority: 1 });
		const retry = await service.retryBatch([12n], undefined, "network:rate_limited");
		const tracking = await repo.getTracking(12n);
		expect(retry.delayMs).toBe(1000);
		expect(tracking?.leaseUntil?.epochMilliseconds).toBe(Date.parse(retry.leaseUntil));
		expect(tracking?.consecutiveFails).toBe(1);
		expect(tracking?.priority).toBe(1);
		expect(tracking?.nextSnapshotAt.toString()).toBe(original?.nextSnapshotAt.toString());
	});
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

	test("keeps API failures owned by the same job for a state-specific retry", async () => {
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
		await service.retryBatch([aid], undefined, "bilibili_api_error:-412");
		const tracking = trackingRepo.trackings.get(aid);
		expect(tracking?.consecutiveFails).toBe(2);
		expect(tracking?.lastError).toBe("bilibili_api_error:-412");
		expect(tracking?.leaseUntil).not.toBeNull();
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
			expect(result.retryAids).toEqual([String(requestedAid2)]);
			await service.retryBatch(
				result.retryAids ?? [],
				undefined,
				"video_missing_from_stats_response"
			);
		}

		const missing = trackingRepo.trackings.get(requestedAid2);
		expect(missing?.consecutiveFails).toBe(1);
		expect(missing?.lastError).toBe("video_missing_from_stats_response");
		expect(missing?.leaseUntil).not.toBeNull();
		expect((await trackingRepo.getTracking(requestedAid1))?.leaseUntil).toBeNull();
	});
});
