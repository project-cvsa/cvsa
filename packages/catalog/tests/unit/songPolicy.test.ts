import { describe, expect, it } from "bun:test";
import { createUserPrincipal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import { type Song, toInstant } from "@cvsa/db";
import {
	assertCanCreateSong,
	assertCanDeleteSong,
	assertCanUpdateSong,
	assertCanUpdateSongFields,
	canCreateSong,
	canDeleteSong,
	canUpdateSong,
	canUpdateSongField,
} from "../../src/song/songPolicy";

describe("songPolicy", () => {
	const mockSong: Song = {
		id: 1,
		name: "Test Song",
		type: "ORIGINAL",
		originalSongId: null,
		language: "zh",
		localizedNames: null,
		duration: 180,
		description: "A test song",
		localizedDescriptions: null,
		bilibiliAid: null,
		bilibiliBvid: null,
		vocadbId: null,
		vcpediaId: null,
		moegirlId: null,
		coverUrl: null,
		publishedAt: null,
		createdAt: toInstant(new Date()),
		updatedAt: toInstant(new Date()),
		deletedAt: null,
	};

	it("allows admin to create, update, and delete", () => {
		const admin = createUserPrincipal({
			userId: "admin-1",
			roles: ["admin"],
		});

		expect(canCreateSong(admin)).toBe(true);
		expect(canUpdateSong(admin, mockSong)).toBe(true);
		expect(canDeleteSong(admin, mockSong)).toBe(true);
		expect(() => assertCanCreateSong(admin)).not.toThrow();
		expect(() => assertCanUpdateSong(admin, mockSong)).not.toThrow();
		expect(() => assertCanDeleteSong(admin, mockSong)).not.toThrow();
	});

	it("allows regular user to update standard fields but prevents delete", () => {
		const regularUser = createUserPrincipal({
			userId: "user-2",
			roles: [],
		});

		expect(canCreateSong(regularUser)).toBe(true);
		expect(canUpdateSong(regularUser, mockSong)).toBe(true);
		expect(canDeleteSong(regularUser, mockSong)).toBe(false);

		expect(() => assertCanUpdateSong(regularUser, mockSong)).not.toThrow();
		expect(() => assertCanDeleteSong(regularUser, mockSong)).toThrow(AppError);
	});

	it("validates field-level permissions for update", () => {
		const editor = createUserPrincipal({
			userId: "editor-1",
			roles: ["editor"],
		});

		expect(canUpdateSongField(editor, "name", mockSong)).toBe(true);
		expect(canUpdateSongField(editor, "description", mockSong)).toBe(true);
		expect(canUpdateSongField(editor, "coverUrl", mockSong)).toBe(true);
		expect(canUpdateSongField(editor, "publishedAt", mockSong)).toBe(false);
		expect(canUpdateSongField(editor, "type", mockSong)).toBe(false);

		// updating standard fields succeeds
		expect(() => {
			assertCanUpdateSongFields(editor, mockSong, {
				name: "New Name",
				description: "New Description",
			});
		}).not.toThrow();

		// updating restricted publishedAt throws FORBIDDEN
		expect(() => {
			assertCanUpdateSongFields(editor, mockSong, {
				publishedAt: new Date().toISOString(),
			});
		}).toThrow(AppError);
	});

	it("allows privileged editor to update publishedAt and type", () => {
		const privilegedEditor = createUserPrincipal({
			userId: "editor-priv",
			roles: ["editor"],
			permissions: ["catalog:privileged_fields"],
		});

		expect(canUpdateSongField(privilegedEditor, "publishedAt", mockSong)).toBe(true);
		expect(canUpdateSongField(privilegedEditor, "type", mockSong)).toBe(true);

		expect(() => {
			assertCanUpdateSongFields(privilegedEditor, mockSong, {
				publishedAt: new Date().toISOString(),
				type: "REMIX",
			});
		}).not.toThrow();
	});
});
