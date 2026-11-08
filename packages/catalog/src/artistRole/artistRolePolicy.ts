import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";

export function canCreateArtistRole(actor: Principal): boolean {
	return actor.ability.can("create", "ArtistRole");
}

export function assertCanCreateArtistRole(actor: Principal): void {
	if (!canCreateArtistRole(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateArtistRole(actor: Principal): boolean {
	return actor.ability.can("update", "ArtistRole");
}

export function assertCanUpdateArtistRole(actor: Principal): void {
	if (!canUpdateArtistRole(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canDeleteArtistRole(actor: Principal): boolean {
	return actor.ability.can("delete", "ArtistRole");
}

export function assertCanDeleteArtistRole(actor: Principal): void {
	if (!canDeleteArtistRole(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}
