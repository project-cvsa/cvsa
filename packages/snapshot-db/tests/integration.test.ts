import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { crawlerEnv } from "@cvsa/env";
import { SQL } from "bun";
import { snapshotDb, videoSnapshot } from "../src";

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

		const created = await snapshotDb.client
			.insert(videoSnapshot)
			.values({
				aid,
				views: 100,
				coins: 2,
				likes: 3,
				favorites: 4,
				shares: 5,
				danmakus: 6,
				replies: 7,
			})
			.returning();
		expect(created[0]?.aid).toBe(aid);

		const [found] = await snapshotDb.client
			.select()
			.from(videoSnapshot)
			.where(eq(videoSnapshot.aid, aid));
		expect(found?.views).toBe(100);

		await snapshotDb.client.delete(videoSnapshot).where(eq(videoSnapshot.aid, aid));
	});

	test("runs against the test database, never the development one", () => {
		expect(crawlerEnv.SNAPSHOT_DATABASE_URL).toContain("cvsa_snapshot_test");
	});

	test("keeps video_snapshot a compressed hypertable", async () => {
		const sql = new SQL({ max: 1, url: crawlerEnv.SNAPSHOT_DATABASE_URL });

		try {
			const [state] = await sql<{ compression_enabled: boolean }[]>`
				SELECT compression_enabled
				FROM timescaledb_information.hypertables
				WHERE hypertable_schema = 'public'
					AND hypertable_name = 'video_snapshot'
			`;
			expect(state?.compression_enabled).toBe(true);
		} finally {
			await sql.close();
		}
	});
});
