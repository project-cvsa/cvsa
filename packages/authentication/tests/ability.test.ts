import { describe, expect, it } from "bun:test";
import { AppError } from "@cvsa/contracts";
import {
	assertCanUpdateFields,
	createServicePrincipal,
	createUserPrincipal,
	defineAbilityFor,
	hasPermissionInList,
	subject,
} from "../src";

describe("Ability & Permission authorization", () => {
	describe("hasPermissionInList", () => {
		it("matches exact permissions", () => {
			expect(hasPermissionInList(["catalog:song:edit"], "catalog:song:edit")).toBe(true);
			expect(hasPermissionInList(["catalog:song:edit"], "catalog:song:delete")).toBe(false);
		});

		it("matches wildcard permissions", () => {
			expect(hasPermissionInList(["*"], "anything:anywhere")).toBe(true);
			expect(hasPermissionInList(["catalog:*"], "catalog:song:edit")).toBe(true);
			expect(hasPermissionInList(["catalog:song:*"], "catalog:song:field:publishedAt")).toBe(
				true
			);
			expect(hasPermissionInList(["crawler:*"], "catalog:song:edit")).toBe(false);
		});
	});

	describe("defineAbilityFor", () => {
		it("grants manage all to OWNER and admin", () => {
			const owner = createUserPrincipal({ userId: "owner-1", roles: ["OWNER"] });
			const admin = createUserPrincipal({ userId: "admin-1", roles: ["admin"] });

			expect(owner.ability.can("manage", "all")).toBe(true);
			expect(owner.ability.can("update", "Song", "publishedAt")).toBe(true);
			expect(owner.ability.can("delete", "Song")).toBe(true);
			expect(owner.hasPermission("any:action")).toBe(true);

			expect(admin.ability.can("manage", "all")).toBe(true);
			expect(admin.ability.can("update", "Song", "type")).toBe(true);
			expect(admin.hasPermission("any:action")).toBe(true);
		});

		it("can be called directly with options", () => {
			const directAbility = defineAbilityFor({
				roles: ["admin"],
			});
			expect(directAbility.can("manage", "all")).toBe(true);
		});

		it("grants standard field permissions to editor but restricts privileged fields", () => {
			const editor = createUserPrincipal({ userId: "editor-1", roles: ["editor"] });

			expect(editor.ability.can("read", "Song")).toBe(true);
			expect(editor.ability.can("create", "Song")).toBe(true);
			expect(editor.ability.can("update", "Song", "name")).toBe(true);
			expect(editor.ability.can("update", "Song", "description")).toBe(true);
			expect(editor.ability.can("update", "Song", "coverUrl")).toBe(true);

			// Privileged fields restricted
			expect(editor.ability.can("update", "Song", "publishedAt")).toBe(false);
			expect(editor.ability.can("update", "Song", "type")).toBe(false);

			// Delete restricted
			expect(editor.ability.can("delete", "Song")).toBe(false);
		});

		it("grants privileged field updates when specific permission is present", () => {
			const privilegedEditor = createUserPrincipal({
				userId: "editor-2",
				roles: ["editor"],
				permissions: ["catalog:privileged_fields"],
			});

			expect(privilegedEditor.ability.can("update", "Song", "publishedAt")).toBe(true);
			expect(privilegedEditor.ability.can("update", "Song", "type")).toBe(true);
		});

		it("grants granular single field update when field permission is present", () => {
			const singleFieldEditor = createUserPrincipal({
				userId: "editor-3",
				roles: ["editor"],
				permissions: ["catalog:song:field:publishedAt"],
			});

			expect(singleFieldEditor.ability.can("update", "Song", "publishedAt")).toBe(true);
			expect(singleFieldEditor.ability.can("update", "Song", "type")).toBe(false);
		});

		it("grants delete when catalog:song:delete permission is present", () => {
			const deleter = createUserPrincipal({
				userId: "deleter-1",
				roles: ["editor"],
				permissions: ["catalog:song:delete"],
			});

			expect(deleter.ability.can("delete", "Song")).toBe(true);
			expect(deleter.ability.can("delete", "Artist")).toBe(false);
		});

		it("works with service principals", () => {
			const service = createServicePrincipal({
				serviceId: "svc-crawler",
				auditUserId: "user-system",
				roles: ["service"],
				permissions: ["catalog:privileged_fields"],
			});

			expect(service.ability.can("update", "Song", "publishedAt")).toBe(true);
		});
	});

	describe("assertCanUpdateFields", () => {
		it("passes when all modified fields are permitted", () => {
			const editor = createUserPrincipal({ userId: "editor-1", roles: ["editor"] });

			expect(() => {
				assertCanUpdateFields(editor.ability, "Song", {
					name: "New title",
					description: "New description",
					publishedAt: undefined,
				});
			}).not.toThrow();
		});

		it("throws FORBIDDEN AppError when modifying a restricted field", () => {
			const editor = createUserPrincipal({ userId: "editor-1", roles: ["editor"] });

			let caughtError: AppError | null = null;
			try {
				assertCanUpdateFields(editor.ability, "Song", {
					name: "Valid Title",
					publishedAt: new Date().toISOString(),
				});
			} catch (err) {
				caughtError = err as AppError;
			}

			expect(caughtError).toBeInstanceOf(AppError);
			expect(caughtError?.statusCode).toBe(403);
			expect(caughtError?.code).toBe("FORBIDDEN");
			expect(caughtError?.meta?.field).toBe("publishedAt");
		});

		it("supports subject instance with condition checks", () => {
			const editor = createUserPrincipal({ userId: "editor-1", roles: ["editor"] });
			const songObj = { id: 1, name: "Existing" };

			expect(editor.ability.can("update", subject("Song", songObj), "name")).toBe(true);
			expect(() => {
				assertCanUpdateFields(editor.ability, "Song", { name: "Modified" }, songObj);
			}).not.toThrow();
		});
	});
});
