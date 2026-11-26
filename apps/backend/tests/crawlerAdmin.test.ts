import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { db, role, user as userTable } from "@cvsa/db";
import { eq } from "drizzle-orm";
import { createSession, ensureAdminRole, ensureEditorRole } from "@cvsa/authentication";

const api = treaty(app);
const rand = () => Math.random().toString(36).slice(2, 8);

async function createUserSessionWithRole(roleName: string) {
	let row =
		roleName === "editor"
			? await ensureEditorRole()
			: roleName === "admin"
				? await ensureAdminRole()
				: (await db.select().from(role).where(eq(role.name, roleName)).limit(1))[0];
	if (!row) {
		[row] = await db.insert(role).values({ name: roleName }).returning();
	}
	if (!row) throw new Error(`Failed to create role ${roleName}`);

	const [created] = await db
		.insert(userTable)
		.values({
			id: `u_${rand()}`,
			username: `user_${rand()}`,
			displayUsername: `user_${rand()}`,
			name: `${roleName} User`,
			roleId: row.id,
			reputation: 0,
			emailVerified: false,
		})
		.returning();
	if (!created) throw new Error("Failed to create user");
	const session = await createSession(created.id);
	return { user: created, session, token: session.token };
}

describe("Crawler Admin API Access Control", () => {
	test("should return 401 when unauthenticated", async () => {
		const { status } = await api.v2.admin.crawler.status.get();
		expect(status).toBe(401);
	});

	test("should guard the new crawler control-plane proxies", async () => {
		const stats = await api.v2.admin.crawler.stats.get({ query: { window: "1h" } });
		const tracking = await api.v2.admin.crawler.tracking.videos.get({
			query: { limit: 20, offset: 0 },
		});
		const history = await api.v2.admin.crawler.metadata({ aid: "1" }).history.get({
			query: { limit: 20, offset: 0 },
		});
		const samples = await api.v2.admin.crawler.discovery.samples.get({
			query: { limit: 20, offset: 0 },
		});
		const label = await api.v2.admin.crawler.discovery
			.samples({ aid: "1" })
			.label.post({ humanLabel: 1 });
		const snapshot = await api.v2.admin.crawler.tracking.videos({ aid: "1" }).snapshots.post();
		const snapshotList = await api.v2.admin.crawler.tracking
			.videos({ aid: "1" })
			.snapshots.get({ query: { limit: 20, offset: 0 } });

		expect(stats.status).toBe(401);
		expect(tracking.status).toBe(401);
		expect(history.status).toBe(401);
		expect(samples.status).toBe(401);
		expect(label.status).toBe(401);
		expect(snapshot.status).toBe(401);
		expect(snapshotList.status).toBe(401);
	});

	test("should return 403 when authenticated as regular user (non-admin)", async () => {
		const [regularRole] = await db
			.insert(role)
			.values({
				name: `USER_${rand()}`,
			})
			.returning();

		const [user] = await db
			.insert(userTable)
			.values({
				id: `u_${rand()}`,
				username: `user_${rand()}`,
				displayUsername: `user_${rand()}`,
				name: "Regular User",
				roleId: regularRole.id,
				reputation: 0,
				emailVerified: false,
			})
			.returning();

		const session = await createSession(user.id);

		const { status, error } = await api.v2.admin.crawler.status.get({
			headers: {
				authorization: `Bearer ${session.token}`,
				"x-locale": "zh",
			},
		});

		expect(status).toBe(403);
		expect(error?.value).toMatchObject({
			code: "FORBIDDEN",
			message: "无权访问此资源",
		});
	});

	test("should pass admin check when user has OWNER role", async () => {
		let [ownerRole] = await db.select().from(role).where(eq(role.name, "OWNER")).limit(1);
		if (!ownerRole) {
			[ownerRole] = await db
				.insert(role)
				.values({
					name: "OWNER",
				})
				.returning();
		}

		const [owner] = await db
			.insert(userTable)
			.values({
				id: `u_${rand()}`,
				username: `owner_${rand()}`,
				displayUsername: `owner_${rand()}`,
				name: "Owner User",
				roleId: ownerRole.id,
				reputation: 0,
				emailVerified: false,
			})
			.returning();

		const session = await createSession(owner.id);

		const { status } = await api.v2.admin.crawler.status.get({
			headers: {
				authorization: `Bearer ${session.token}`,
			},
		});

		// 200 (if crawler service online) or 502 (THIRD_PARTY_ERROR when crawler offline)
		// But definitively NOT 401 and NOT 403!
		expect([200, 502]).toContain(status);

		const stats = await api.v2.admin.crawler.stats.get({
			query: { window: "1h", quantiles: "0.5,0.9,0.95,0.99" },
			headers: { authorization: `Bearer ${session.token}` },
		});
		const samples = await api.v2.admin.crawler.discovery.samples.get({
			query: { limit: 20, offset: 0 },
			headers: { authorization: `Bearer ${session.token}` },
		});

		expect([200, 502]).toContain(stats.status);
		expect([200, 502]).toContain(samples.status);
	});

	test("allows editor on read, labeling, annotation, curation, backfill, and export endpoints", async () => {
		const { token } = await createUserSessionWithRole("editor");
		const headers = { authorization: `Bearer ${token}` };

		const statusRes = await api.v2.admin.crawler.status.get({ headers });
		const statsRes = await api.v2.admin.crawler.stats.get({
			query: { window: "1h" },
			headers,
		});
		const samplesRes = await api.v2.admin.crawler.discovery.samples.get({
			query: { limit: 20, offset: 0 },
			headers,
		});
		const labelRes = await api.v2.admin.crawler.discovery
			.samples({ aid: "1" })
			.label.post({ decision: "uncertain" }, { headers });
		const annotateRes = await api.v2.admin.crawler.discovery
			.samples({ aid: "1" })
			.annotations.post({ decision: "uncertain" }, { headers });
		const curateRes = await api.v2.admin.crawler.discovery
			.samples({ aid: "1" })
			.curate.post({ status: "pending" }, { headers });
		const backfillRes = await api.v2.admin.crawler.discovery.samples.metadata.backfill.post(
			{ limit: 5 },
			{ headers }
		);
		const exportRes = await api.v2.admin.crawler.discovery.samples.dataset.export.get({
			query: { format: "jsonl", status: "all" },
			headers,
		});

		for (const res of [
			statusRes,
			statsRes,
			samplesRes,
			labelRes,
			annotateRes,
			curateRes,
			backfillRes,
			exportRes,
		]) {
			expect([401, 403]).not.toContain(res.status);
		}
	});

	test("returns 403 for editor on destructive, config, job-control, milestone, and adapter endpoints", async () => {
		const { token } = await createUserSessionWithRole("editor");
		const headers = { authorization: `Bearer ${token}` };

		const putNetwork = await api.v2.admin.crawler.config.network.put(
			{
				revision: 0,
				config: { adapters: [] },
			},
			{ headers }
		);
		const putDiscovery = await api.v2.admin.crawler.config.discovery.put(
			{
				whitelistSingers: ["洛天依"],
			},
			{ headers }
		);
		const deleteTracking = await api.v2.admin.crawler.tracking({ aid: "1" }).delete(null, {
			headers,
		});
		const retryJob = await api.v2.admin.crawler
			.jobs({ queue: "tracking" })({ id: "1" })
			.retries.post(null, { headers });
		const removeJob = await api.v2.admin.crawler
			.jobs({ queue: "tracking" })({ id: "1" })
			.delete(null, { headers });
		const milestoneList = await api.v2.admin.crawler.milestones
			.videos({ aid: "1" })
			.get({ headers });
		const milestoneImport = await api.v2.admin.crawler.milestones.records.post(
			{
				items: [
					{
						aid: "1",
						threshold: 100000,
						timeKind: "minute",
						at: "2026-11-01T12:30:00+08:00",
					},
				],
			},
			{ headers }
		);
		const adapterTest = await api.v2.admin.crawler.network
			.adapters({ id: "direct-a" })
			.test.post(null, { headers });
		const sweep = await api.v2.admin.crawler.sweep.post({}, { headers });

		for (const res of [
			putNetwork,
			putDiscovery,
			deleteTracking,
			retryJob,
			removeJob,
			milestoneList,
			milestoneImport,
			adapterTest,
			sweep,
		]) {
			expect(res.status).toBe(403);
		}
	});

	test("allows admin role through RBAC on operator endpoints", async () => {
		const { token } = await createUserSessionWithRole("admin");
		const headers = { authorization: `Bearer ${token}` };

		const putDiscovery = await api.v2.admin.crawler.config.discovery.put(
			{
				whitelistSingers: ["洛天依"],
			},
			{ headers }
		);
		const milestoneList = await api.v2.admin.crawler.milestones
			.videos({ aid: "1" })
			.get({ headers });

		expect([401, 403]).not.toContain(putDiscovery.status);
		expect([401, 403]).not.toContain(milestoneList.status);
	});
});
