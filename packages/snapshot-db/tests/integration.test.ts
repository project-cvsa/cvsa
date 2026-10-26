import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { crawlerEnv } from "@cvsa/env";
import { snapshotDb } from "../src";

/**
 * Requires the snapshot database from `docker-compose` and the schema applied by
 * `bun run --cwd packages/snapshot-db test:setup` (which turbo runs as part of
 * `setup:ci`). It is deliberately not opt-in: an integration test that skips
 * itself is indistinguishable from a passing one.
 */
describe("SnapshotDB", () => {
	beforeAll(async () => {
		await snapshotDb.connect();
	});

	afterAll(async () => {
		await snapshotDb.disconnect();
	});

	test("connects and performs the minimum snapshot read/write", async () => {
		await snapshotDb.healthCheck();
		const aid = BigInt(Date.now());

		const created = await snapshotDb.client.orm.public.VideoSnapshot.create({
			aid,
			views: 100,
			coins: 2,
			likes: 3,
			favorites: 4,
			shares: 5,
			danmakus: 6,
			replies: 7,
		});

		expect(created.aid).toBe(aid);

		const found = await snapshotDb.client.orm.public.VideoSnapshot.where({
			aid,
		}).first();
		expect(found?.views).toBe(100);

		await snapshotDb.client.orm.public.VideoSnapshot.where({
			aid,
		}).deleteAll();
	});

	test("runs against the test database, never the development one", () => {
		expect(crawlerEnv.SNAPSHOT_DATABASE_URL).toContain("cvsa_snapshot_test");
	});
});
