import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";

export function assertCanCreateArtistRole(actor: Principal): void {
	if (actor.roles.includes("admin") || actor.roles.includes("editor")) {
		return;
	}
	if (actor.type === "service" || actor.type === "user") {
		return;
	}
	throw new AppError("error.forbidden", "FORBIDDEN", 403);
}

export function assertCanUpdateArtistRole(actor: Principal): void {
	if (actor.roles.includes("admin") || actor.roles.includes("editor")) {
		return;
	}
	if (actor.type === "service" || actor.type === "user") {
		return;
	}
	throw new AppError("error.forbidden", "FORBIDDEN", 403);
}

export function assertCanDeleteArtistRole(actor: Principal): void {
	if (actor.roles.includes("admin")) {
		return;
	}
	throw new AppError("error.forbidden", "FORBIDDEN", 403);
}
