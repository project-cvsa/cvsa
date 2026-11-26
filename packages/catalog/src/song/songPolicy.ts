import { type Principal, assertCanUpdateFields, subject } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { Song } from "@cvsa/db";
import type { UpdateSongInput } from "./songTypes";

export function canCreateSong(actor: Principal): boolean {
	return actor.ability.can("create", "Song");
}

export function assertCanCreateSong(actor: Principal): void {
	if (!canCreateSong(actor)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateSong(actor: Principal, song?: Song): boolean {
	return song
		? actor.ability.can("update", subject("Song", song))
		: actor.ability.can("update", "Song");
}

export function assertCanUpdateSong(actor: Principal, song: Song): void {
	if (!canUpdateSong(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canDeleteSong(actor: Principal, song?: Song): boolean {
	return song
		? actor.ability.can("delete", subject("Song", song))
		: actor.ability.can("delete", "Song");
}

export function assertCanDeleteSong(actor: Principal, song: Song): void {
	if (!canDeleteSong(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canManageLyrics(actor: Principal, song?: Song): boolean {
	return canUpdateSong(actor, song);
}

export function assertCanManageLyrics(actor: Principal, song: Song): void {
	if (!canManageLyrics(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canManageExternalLinks(actor: Principal, song?: Song): boolean {
	return canUpdateSong(actor, song);
}

export function assertCanManageExternalLinks(actor: Principal, song: Song): void {
	if (!canManageExternalLinks(actor, song)) {
		throw new AppError("error.forbidden", "FORBIDDEN", 403);
	}
}

export function canUpdateSongField(actor: Principal, field: string, song?: Song): boolean {
	return song
		? actor.ability.can("update", subject("Song", song), field)
		: actor.ability.can("update", "Song", field);
}

export function assertCanUpdateSongFields(
	actor: Principal,
	existing: Song,
	input: UpdateSongInput
): void {
	assertCanUpdateFields(actor.ability, "Song", input, existing);
}
