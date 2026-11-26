import { type AppAbility, defineAbilityFor, hasPermissionInList } from "./ability";

export type PrincipalType = "user" | "service";

export interface Principal {
	readonly id: string;
	readonly type: PrincipalType;
	readonly auditUserId: string;
	readonly roles: readonly string[];
	readonly permissions: readonly string[];
	readonly ability: AppAbility;
	hasPermission(action: string): boolean;
}

export interface CreateUserPrincipalOptions {
	readonly userId: string;
	readonly roles?: readonly string[];
	readonly permissions?: readonly string[];
}

export function createUserPrincipal(options: CreateUserPrincipalOptions): Principal {
	const roles: string[] = options.roles ? [...options.roles] : [];
	if (roles.includes("OWNER") || roles.includes("admin")) {
		if (!roles.includes("admin")) roles.push("admin");
		if (!roles.includes("editor")) roles.push("editor");
		if (!roles.includes("OWNER")) roles.push("OWNER");
	}
	const permissions = options.permissions ?? [];
	const ability = defineAbilityFor({
		type: "user",
		roles,
		permissions,
	});

	return {
		id: options.userId,
		type: "user",
		auditUserId: options.userId,
		roles,
		permissions,
		ability,
		hasPermission: (action: string) =>
			roles.includes("admin") ||
			roles.includes("OWNER") ||
			hasPermissionInList(permissions, action),
	};
}

export interface CreateServicePrincipalOptions {
	readonly serviceId: string;
	readonly auditUserId: string;
	readonly roles?: readonly string[];
	readonly permissions?: readonly string[];
}

export function createServicePrincipal(options: CreateServicePrincipalOptions): Principal {
	const roles = options.roles ?? [];
	const permissions = options.permissions ?? [];
	const ability = defineAbilityFor({
		type: "service",
		roles,
		permissions,
	});

	return {
		id: options.serviceId,
		type: "service",
		auditUserId: options.auditUserId,
		roles,
		permissions,
		ability,
		hasPermission: (action: string) =>
			roles.includes("admin") ||
			roles.includes("OWNER") ||
			hasPermissionInList(permissions, action),
	};
}

export function isUserPrincipal(principal: Principal): boolean {
	return principal.type === "user";
}

export function isServicePrincipal(principal: Principal): boolean {
	return principal.type === "service";
}
