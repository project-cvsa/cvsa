import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { crawlerEnv } from "@cvsa/env";
import { snapshotDb } from "../src";

const integrationTest = process.env.SNAPSHOT_DB_TESTS === "1" ? test : test.skip;

describe("SnapshotDB", () => {
	beforeAll(async () => {
		if (process.env.SNAPSHOT_DB_TESTS === "1") {
			await snapshotDb.connect();
		}
	});

	afterAll(async () => {
		if (process.env.SNAPSHOT_DB_TESTS === "1") {
			await snapshotDb.disconnect();
		}
	});

	integrationTest("connects and performs the minimum snapshot read/write", async () => {
		await snapshotDb.healthCheck();
		const aid = BigInt(Date.now());
		const capturedAt = new Date();

		const created = await snapshotDb.client.videoSnapshot.create({
			data: {
				aid,
				capturedAt,
				views: 100,
				coins: 2,
				likes: 3,
				favorites: 4,
				shares: 5,
				danmakus: 6,
				replies: 7,
			},
		});

		expect(created.aid).toBe(aid);
		expect(created.capturedAt).toEqual(capturedAt);

		const found = await snapshotDb.client.videoSnapshot.findUnique({
			where: { aid_capturedAt: { aid, capturedAt } },
		});
		expect(found?.views).toBe(100);

		await snapshotDb.client.videoSnapshot.delete({
			where: { aid_capturedAt: { aid, capturedAt } },
		});
	});

	test("uses the crawler-owned SnapshotDB configuration", () => {
		expect(crawlerEnv.CRAWLER_SNAPSHOT_DATABASE_URL).toContain("cvsa_snapshot");
	});
});
