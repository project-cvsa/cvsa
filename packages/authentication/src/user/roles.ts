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
	let ownerRole = await prisma.orm.meta.Role.where({ name: "OWNER" }).first();
	if (!ownerRole) {
		ownerRole = await prisma.orm.meta.Role.create({
			name: "OWNER",
			localizedNames: { zh: "所有者", en: "Owner" },
		});
	}
	return ownerRole;
}
