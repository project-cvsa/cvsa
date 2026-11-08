import {
	type ForcedSubject,
	type MongoAbility,
	AbilityBuilder,
	createMongoAbility,
	subject,
} from "@casl/ability";
import { AppError } from "@cvsa/contracts";
import type { Principal, PrincipalType } from "./principal";

export type AppAction = "manage" | "create" | "read" | "update" | "delete";
export type AppSubject = "all" | "Song" | "Artist" | "Singer" | "Engine" | "ArtistRole";

export type AppAbility = MongoAbility<[AppAction, AppSubject | ForcedSubject<AppSubject>]>;

export const STANDARD_SONG_FIELDS = [
	"name",
	"duration",
	"description",
	"coverUrl",
	"localizedNames",
	"localizedDescriptions",
	"bilibiliAid",
	"bilibiliBvid",
	"vocadbId",
	"vcpediaId",
	"moegirlId",
	"lyrics",
	"externalLinks",
] as const;

export const PRIVILEGED_SONG_FIELDS = [
	"publishedAt",
	"type",
	"originalSongId",
	"language",
] as const;

export interface DefineAbilityOptions {
	readonly type?: PrincipalType;
	readonly roles?: readonly string[];
	readonly permissions?: readonly string[];
}

export function hasPermissionInList(
	permissions: readonly string[],
	requiredAction: string
): boolean {
	if (permissions.includes("*")) return true;
	if (permissions.includes(requiredAction)) return true;

	const parts = requiredAction.split(":");
	let prefix = "";
	for (let i = 0; i < parts.length - 1; i++) {
		prefix += (i === 0 ? "" : ":") + parts[i];
		if (permissions.includes(`${prefix}:*`)) {
			return true;
		}
	}
	return false;
}

export function defineAbilityFor(principalOrOptions: Principal | DefineAbilityOptions): AppAbility {
	const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
	const roles = principalOrOptions.roles ?? [];
	const permissions = principalOrOptions.permissions ?? [];
	const type = principalOrOptions.type ?? "user";

	// 1. Superusers (OWNER or admin) have full control over all entities and fields
	if (roles.includes("OWNER") || roles.includes("admin")) {
		can("manage", "all");
		return build();
	}

	// Read is public / allowed for all authenticated principals
	can("read", "all");

	// 2. Editor or standard authenticated user / service
	const isEditor = roles.includes("editor");
	const isUserOrService = type === "user" || type === "service";

	if (isEditor || isUserOrService) {
		can("create", "Song");
		can("create", "Artist");
		can("create", "Singer");
		can("create", "ArtistRole");

		can("update", "Artist");
		can("update", "Singer");
		can("update", "ArtistRole");

		// Standard song fields
		can("update", "Song", [...STANDARD_SONG_FIELDS]);
	}

	if (
		hasPermissionInList(permissions, "catalog:engine:create") ||
		hasPermissionInList(permissions, "catalog:engine:*")
	) {
		can("create", "Engine");
	}
	if (
		hasPermissionInList(permissions, "catalog:engine:update") ||
		hasPermissionInList(permissions, "catalog:engine:edit") ||
		hasPermissionInList(permissions, "catalog:engine:*")
	) {
		can("update", "Engine");
	}

	// 3. Privileged fields on Song
	const hasPrivilegedFieldPermission =
		hasPermissionInList(permissions, "catalog:privileged_fields") ||
		hasPermissionInList(permissions, "catalog:song:privileged_fields");

	if (hasPrivilegedFieldPermission) {
		can("update", "Song", [...PRIVILEGED_SONG_FIELDS]);
	} else {
		for (const field of PRIVILEGED_SONG_FIELDS) {
			if (hasPermissionInList(permissions, `catalog:song:field:${field}`)) {
				can("update", "Song", field);
			}
		}
	}

	// 4. Delete permissions
	if (
		hasPermissionInList(permissions, "catalog:song:delete") ||
		hasPermissionInList(permissions, "catalog:delete")
	) {
		can("delete", "Song");
	}
	if (
		hasPermissionInList(permissions, "catalog:artist:delete") ||
		hasPermissionInList(permissions, "catalog:delete")
	) {
		can("delete", "Artist");
	}
	if (
		hasPermissionInList(permissions, "catalog:singer:delete") ||
		hasPermissionInList(permissions, "catalog:delete")
	) {
		can("delete", "Singer");
	}
	if (
		hasPermissionInList(permissions, "catalog:engine:delete") ||
		hasPermissionInList(permissions, "catalog:delete")
	) {
		can("delete", "Engine");
	}
	if (
		hasPermissionInList(permissions, "catalog:artistRole:delete") ||
		hasPermissionInList(permissions, "catalog:delete")
	) {
		can("delete", "ArtistRole");
	}

	return build();
}

export function assertCanUpdateFields<T extends object, S extends object = object>(
	ability: AppAbility,
	subjectName: AppSubject,
	input: T,
	existing?: S
): void {
	const modifiedKeys = Object.keys(input) as (keyof T)[];
	const subjectTarget = existing ? subject(subjectName, existing) : subjectName;

	for (const key of modifiedKeys) {
		if (input[key] === undefined) continue;

		if (!ability.can("update", subjectTarget, String(key))) {
			throw new AppError("error.forbidden.restricted_field", "FORBIDDEN", 403, {
				field: String(key),
				message: `No permission to update field: ${String(key)}`,
			});
		}
	}
}

export { subject };
