import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { Song } from "@cvsa/db";

export function canCreateSong(actor: Principal): boolean {
	if (actor.roles.includes("admin") || actor.roles.includes("editor")) {
		return true;
	}
	if (actor.permissions.includes("catalog:song:create")) {
		return true;
	}
	return actor.type === "user" || actor.type === "service";
}

export function assertCanCreateSong(actor: Principal): void {
	if (!canCreateSong(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateSong(actor: Principal, _song: Song): boolean {
	if (actor.roles.includes("admin") || actor.roles.includes("editor")) {
		return true;
	}
	if (
		actor.permissions.includes("catalog:song:edit") ||
		actor.permissions.includes("catalog:edit")
	) {
		return true;
	}
	return actor.type === "user" || actor.type === "service";
}

export function assertCanUpdateSong(actor: Principal, song: Song): void {
	if (!canUpdateSong(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canDeleteSong(actor: Principal, _song: Song): boolean {
	if (actor.roles.includes("admin")) {
		return true;
	}
	return actor.permissions.includes("catalog:song:delete");
}

export function assertCanDeleteSong(actor: Principal, song: Song): void {
	if (!canDeleteSong(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canManageLyrics(actor: Principal, _song: Song): boolean {
	return canUpdateSong(actor, _song);
}

export function assertCanManageLyrics(actor: Principal, song: Song): void {
	if (!canManageLyrics(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canManageExternalLinks(actor: Principal, _song: Song): boolean {
	return canUpdateSong(actor, _song);
}

export function assertCanManageExternalLinks(actor: Principal, song: Song): void {
	if (!canManageExternalLinks(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}
