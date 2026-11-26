import { type DatabaseClient, type Role, type TxClient, db, role } from "@cvsa/db";
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

async function ensureRole(
	name: string,
	localizedNames: { zh: string; en: string },
	executor: DatabaseClient | TxClient = db
): Promise<Role> {
	// `onConflictDoNothing` keeps this safe under concurrency: parallel
	// registrations (the test suite runs them concurrently) would otherwise both
	// observe a missing role and race to insert it, failing one request on
	// `role_name_key`.
	const [created] = await executor
		.insert(role)
		.values({
			name,
			localizedNames,
		})
		.onConflictDoNothing({ target: role.name })
		.returning();
	if (created) {
		return created;
	}

	const [existing] = await executor.select().from(role).where(eq(role.name, name)).limit(1);
	if (!existing) throw new Error(`Failed to ensure the ${name} role`);
	return existing;
}

export async function ensureOwnerRole(executor: DatabaseClient | TxClient = db): Promise<Role> {
	return ensureRole("OWNER", { zh: "所有者", en: "Owner" }, executor);
}

export async function ensureAdminRole(executor: DatabaseClient | TxClient = db): Promise<Role> {
	return ensureRole("admin", { zh: "管理员", en: "Admin" }, executor);
}

export async function ensureEditorRole(executor: DatabaseClient | TxClient = db): Promise<Role> {
	return ensureRole("editor", { zh: "编辑者", en: "Editor" }, executor);
}

export async function getRoleByName(
	name: string,
	executor: DatabaseClient | TxClient = db
): Promise<Role | null> {
	const [row] = await executor.select().from(role).where(eq(role.name, name)).limit(1);
	return row ?? null;
}
