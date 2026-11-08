import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";

export function canCreateSinger(actor: Principal): boolean {
	return actor.ability.can("create", "Singer");
}

export function assertCanCreateSinger(actor: Principal): void {
	if (!canCreateSinger(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateSinger(actor: Principal): boolean {
	return actor.ability.can("update", "Singer");
}

export function assertCanUpdateSinger(actor: Principal): void {
	if (!canUpdateSinger(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canDeleteSinger(actor: Principal): boolean {
	return actor.ability.can("delete", "Singer");
}

export function assertCanDeleteSinger(actor: Principal): void {
	if (!canDeleteSinger(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}
