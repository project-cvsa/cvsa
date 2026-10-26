import { prisma, type Role } from "@cvsa/db";

const roleCache = new Map<number, string>();

export async function getRoleNameById(roleId: number): Promise<string | null> {
	const cached = roleCache.get(roleId);
	if (cached !== undefined) {
		return cached;
	}
	const role = await prisma.orm.meta.Role.where({ id: roleId }).first();
	if (role?.name) {
		roleCache.set(roleId, role.name);
		return role.name;
	}
	return null;
}

export async function ensureOwnerRole(): Promise<Role> {
	// `upsert` keeps this safe under concurrency: parallel registrations (the
	// test suite runs them concurrently) would otherwise both observe a missing
	// OWNER role and race to insert it, failing one request on `role_name_key`.
	return prisma.orm.meta.Role.upsert({
		create: {
			name: "OWNER",
			localizedNames: { zh: "所有者", en: "Owner" },
		},
		update: {},
		conflictOn: { name: "OWNER" },
	});
}
