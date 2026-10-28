import { describe, expect, test } from "bun:test";
import { AppError, TrackingAidParamsSchema } from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import { ManualSnapshotService } from "../src/crawler/tracking/manualSnapshot";
import {
	createFakeMq,
	createTrackingRow,
	InMemoryTrackingRepository,
} from "../src/crawler/testing/fakes";
import type { SnapshotBatchJobData } from "../src/crawler/snapshot/worker";

describe("manual snapshot", () => {
	test("queues a leased tracked video and rejects a duplicate", async () => {
		const repo = new InMemoryTrackingRepository();
		repo.trackings.set(12n, createTrackingRow(12n));
		const mq = createFakeMq();
		const service = new ManualSnapshotService(
			repo,
			mq.createQueue<SnapshotBatchJobData>("snapshot-batch")
		);
		expect(await service.enqueue("12")).toEqual({ queued: true, aid: "12" });
		expect(mq.state.queuedJobs[0]).toMatchObject({
			name: "process-batch",
			data: { aids: ["12"] },
		});
		expect(repo.trackings.get(12n)?.leaseUntil).not.toBeNull();
		await expect(service.enqueue("12")).rejects.toMatchObject({ code: "ENTITY_CONFLICT" });
	});

	test("rejects missing videos and releases the lease if queuing fails", async () => {
		const repo = new InMemoryTrackingRepository();
		const mq = createFakeMq();
		const queue = mq.createQueue<SnapshotBatchJobData>("snapshot-batch");
		const service = new ManualSnapshotService(repo, queue);
		await expect(service.enqueue("12")).rejects.toBeInstanceOf(AppError);
		repo.trackings.set(12n, createTrackingRow(12n, { nextSnapshotAt: toInstant(new Date()) }));
		queue.add = async () => {
			throw new Error("queue unavailable");
		};
		await expect(service.enqueue("12")).rejects.toThrow("queue unavailable");
		expect(repo.trackings.get(12n)?.leaseUntil).toBeNull();
	});

	test("validates AIDs before conversion", () => {
		for (const aid of ["BV123", "0", "-1", "9223372036854775808", "12345678901234567890"]) {
			expect(TrackingAidParamsSchema.safeParse({ aid }).success).toBe(false);
		}
		expect(TrackingAidParamsSchema.safeParse({ aid: "12" }).success).toBe(true);
	});
});
