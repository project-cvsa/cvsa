import { describe, expect, it } from "bun:test";
import {
	createUserPrincipal,
	createServicePrincipal,
	isUserPrincipal,
	isServicePrincipal,
} from "../src";

describe("Principal", () => {
	it("creates a user principal", () => {
		const principal = createUserPrincipal({
			userId: "user-123",
			roles: ["admin"],
			permissions: ["catalog:song:edit"],
		});

		expect(principal.id).toBe("user-123");
		expect(principal.type).toBe("user");
		expect(principal.auditUserId).toBe("user-123");
		expect(principal.roles).toContain("admin");
		expect(principal.permissions).toContain("catalog:song:edit");
		expect(isUserPrincipal(principal)).toBe(true);
		expect(isServicePrincipal(principal)).toBe(false);
	});

	it("creates a service principal with audit user", () => {
		const principal = createServicePrincipal({
			serviceId: "service-crawler",
			auditUserId: "system-audit-user-id",
			roles: ["crawler"],
		});

		expect(principal.id).toBe("service-crawler");
		expect(principal.type).toBe("service");
		expect(principal.auditUserId).toBe("system-audit-user-id");
		expect(principal.roles).toContain("crawler");
		expect(isServicePrincipal(principal)).toBe(true);
		expect(isUserPrincipal(principal)).toBe(false);
	});
});
