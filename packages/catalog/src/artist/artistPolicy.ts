import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";

export function canCreateArtist(actor: Principal): boolean {
	return actor.ability.can("create", "Artist");
}

export function assertCanCreateArtist(actor: Principal): void {
	if (!canCreateArtist(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateArtist(actor: Principal): boolean {
	return actor.ability.can("update", "Artist");
}

export function assertCanUpdateArtist(actor: Principal): void {
	if (!canUpdateArtist(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canDeleteArtist(actor: Principal): boolean {
	return actor.ability.can("delete", "Artist");
}

export function assertCanDeleteArtist(actor: Principal): void {
	if (!canDeleteArtist(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}
