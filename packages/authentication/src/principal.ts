export type PrincipalType = "user" | "service";

export interface Principal {
	readonly id: string;
	readonly type: PrincipalType;
	readonly auditUserId: string;
	readonly roles: readonly string[];
	readonly permissions: readonly string[];
}

export interface CreateUserPrincipalOptions {
	readonly userId: string;
	readonly roles?: readonly string[];
	readonly permissions?: readonly string[];
}

export function createUserPrincipal(options: CreateUserPrincipalOptions): Principal {
	return {
		id: options.userId,
		type: "user",
		auditUserId: options.userId,
		roles: options.roles ?? [],
		permissions: options.permissions ?? [],
	};
}

export interface CreateServicePrincipalOptions {
	readonly serviceId: string;
	readonly auditUserId: string;
	readonly roles?: readonly string[];
	readonly permissions?: readonly string[];
}

export function createServicePrincipal(options: CreateServicePrincipalOptions): Principal {
	return {
		id: options.serviceId,
		type: "service",
		auditUserId: options.auditUserId,
		roles: options.roles ?? [],
		permissions: options.permissions ?? [],
	};
}

export function isUserPrincipal(principal: Principal): boolean {
	return principal.type === "user";
}

export function isServicePrincipal(principal: Principal): boolean {
	return principal.type === "service";
}
