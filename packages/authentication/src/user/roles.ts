import { type Role, db, role } from "@cvsa/db";
import { eq } from "drizzle-orm";

const roleCache = new Map<number, string>();

export async function getRoleNameById(roleId: number): Promise<string | null> {
	const cached = roleCache.get(roleId);
	if (cached !== undefined) {
		return cached;
	}
	const [row] = await db.select().from(role).where(eq(role.id, roleId)).limit(1);
	if (row?.name) {
		roleCache.set(roleId, row.name);
		return row.name;
	}
	return null;
}

export async function ensureOwnerRole(): Promise<Role> {
	// `onConflictDoNothing` keeps this safe under concurrency: parallel
	// registrations (the test suite runs them concurrently) would otherwise both
	// observe a missing OWNER role and race to insert it, failing one request on
	// `role_name_key`.
	const [created] = await db
		.insert(role)
		.values({
			name: "OWNER",
			localizedNames: { zh: "所有者", en: "Owner" },
		})
		.onConflictDoNothing({ target: role.name })
		.returning();
	if (created) {
		return created;
	}

	const [existing] = await db.select().from(role).where(eq(role.name, "OWNER")).limit(1);
	if (!existing) throw new Error("Failed to ensure the OWNER role");
	return existing;
}
