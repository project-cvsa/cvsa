import { describe, expect, test } from "bun:test";
import {
	artistRoleRepository,
	type CreateArtistRoleRequestDto,
	type UpdateArtistRoleRequestDto,
} from "@cvsa/core";

const repository = artistRoleRepository;

describe("ArtistRoleRepository Integration Tests", () => {
	describe("create", () => {
		test("should create an artist role with all fields", async () => {
			const input: CreateArtistRoleRequestDto = {
				name: "Producer",
				localizedNames: { zh: "制作人", ja: "プロデューサー" },
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("Producer");
			expect(result.localizedNames).toEqual({ zh: "制作人", ja: "プロデューサー" });
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should create an artist role with minimal fields", async () => {
			const input: CreateArtistRoleRequestDto = {
				name: "Composer",
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("Composer");
			expect(result.localizedNames).toBeNull();
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});
	});

	describe("getById", () => {
		test("should return role when exists", async () => {
			const created = await repository.create({ name: "Illustrator" });
			const result = await repository.getById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("Illustrator");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when role does not exist", async () => {
			const result = await repository.getById(999999);
			expect(result).toBeNull();
		});
	});

	describe("getDetailsById", () => {
		test("should return role details when exists", async () => {
			const created = await repository.create({
				name: "Lyricist",
				localizedNames: { zh: "作词人" },
			});
			const result = await repository.getDetailsById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("Lyricist");
			expect(result?.localizedNames).toEqual({ zh: "作词人" });
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when role does not exist", async () => {
			const result = await repository.getDetailsById(999999);
			expect(result).toBeNull();
		});
	});

	describe("update", () => {
		test("should update all fields", async () => {
			const created = await repository.create({
				name: "Old Role",
				localizedNames: { zh: "旧角色" },
			});

			const input: UpdateArtistRoleRequestDto = {
				name: "New Role",
				localizedNames: { zh: "新角色", en: "New Role" },
			};

			const result = await repository.update(created.id, input);

			expect(result.name).toBe("New Role");
			expect(result.localizedNames).toEqual({ zh: "新角色", en: "New Role" });
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should update only specified fields", async () => {
			const created = await repository.create({
				name: "Original Name",
				localizedNames: { zh: "原名" },
			});

			const result = await repository.update(created.id, { name: "Updated Name" });

			expect(result.name).toBe("Updated Name");
			expect(result.localizedNames).toEqual({ zh: "原名" });
		});
	});

	describe("softDelete", () => {
		test("should soft delete a role", async () => {
			const created = await repository.create({ name: "Role to Delete" });

			await repository.softDelete(created.id);

			const result = await repository.getById(created.id);
			expect(result).toBeNull();
		});
	});
});
