import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";

export function canCreateEngine(actor: Principal): boolean {
	return actor.ability.can("create", "Engine");
}

export function assertCanCreateEngine(actor: Principal): void {
	if (!canCreateEngine(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateEngine(actor: Principal): boolean {
	return actor.ability.can("update", "Engine");
}

export function assertCanUpdateEngine(actor: Principal): void {
	if (!canUpdateEngine(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canDeleteEngine(actor: Principal): boolean {
	return actor.ability.can("delete", "Engine");
}

export function assertCanDeleteEngine(actor: Principal): void {
	if (!canDeleteEngine(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}
