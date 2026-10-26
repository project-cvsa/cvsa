import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";

export function assertCanCreateEngine(actor: Principal): void {
	if (actor.roles.includes("admin")) {
		return;
	}
	throw new AppError("error.forbidden", "FORBIDDEN", 403);
}

export function assertCanUpdateEngine(actor: Principal): void {
	if (actor.roles.includes("admin")) {
		return;
	}
	throw new AppError("error.forbidden", "FORBIDDEN", 403);
}

export function assertCanDeleteEngine(actor: Principal): void {
	if (actor.roles.includes("admin")) {
		return;
	}
	throw new AppError("error.forbidden", "FORBIDDEN", 403);
}
