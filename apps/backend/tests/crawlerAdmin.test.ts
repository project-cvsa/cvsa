import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { db, role, user as userTable } from "@cvsa/db";
import { eq } from "drizzle-orm";
import { createSession } from "@cvsa/authentication";

const api = treaty(app);
const rand = () => Math.random().toString(36).slice(2, 8);

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
			query: { window: "1h" },
			headers: { authorization: `Bearer ${session.token}` },
		});
		const samples = await api.v2.admin.crawler.discovery.samples.get({
			query: { limit: 20, offset: 0 },
			headers: { authorization: `Bearer ${session.token}` },
		});

		expect([200, 502]).toContain(stats.status);
		expect([200, 502]).toContain(samples.status);
	});
});
