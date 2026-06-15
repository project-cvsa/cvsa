import { describe, expect, test } from "bun:test";
import {
	artistRepository,
	type CreateArtistRequestDto,
	type UpdateArtistRequestDto,
} from "@cvsa/core";

const repository = artistRepository;

describe("ArtistRepository Integration Tests", () => {
	describe("create", () => {
		test("should create an artist with all fields", async () => {
			const input: CreateArtistRequestDto = {
				name: "月华P",
				localizedNames: { ja: "月華P", en: "Gekka P" },
				language: "zh",
				aliases: ["月光P", "Moonlight"],
				description: "A famous composer in the Chinese vocal synth community",
				localizedDescriptions: {
					en: "A famous composer",
					ja: "有名な作曲家",
				},
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("月华P");
			expect(result.localizedNames).toEqual({ ja: "月華P", en: "Gekka P" });
			expect(result.language).toBe("zh");
			expect(result.aliases).toEqual(["月光P", "Moonlight"]);
			expect(result.description).toBe(
				"A famous composer in the Chinese vocal synth community"
			);
			expect(result.localizedDescriptions).toEqual({
				en: "A famous composer",
				ja: "有名な作曲家",
			});
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should create an artist with minimal fields", async () => {
			const input: CreateArtistRequestDto = {
				name: "无名P",
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("无名P");
			expect(result.localizedNames).toBeNull();
			// language has default value "zh" in database
			expect(result.language).toBe("zh");
			// aliases is String[] with default empty array
			expect(result.aliases).toEqual([]);
			expect(result.description).toBeNull();
			expect(result.localizedDescriptions).toBeNull();
		});
	});

	describe("getById", () => {
		test("should return artist when exists", async () => {
			const created = await repository.create({ name: "赤羽P" });
			const result = await repository.getById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("赤羽P");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when artist does not exist", async () => {
			const result = await repository.getById(999999);
			expect(result).toBeNull();
		});
	});

	describe("getDetailsById", () => {
		test("should return artist details when exists", async () => {
			const created = await repository.create({
				name: "星尘P",
				description: "Composer of 星尘 series",
			});
			const result = await repository.getDetailsById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("星尘P");
			expect(result?.description).toBe("Composer of 星尘 series");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when artist does not exist", async () => {
			const result = await repository.getDetailsById(999999);
			expect(result).toBeNull();
		});
	});

	describe("update", () => {
		test("should update all fields", async () => {
			const created = await repository.create({
				name: "Old Name",
				language: "zh",
				aliases: ["old"],
			});

			const input: UpdateArtistRequestDto = {
				name: "New Name",
				language: "en",
				aliases: ["new", "alias"],
				description: "Updated description",
			};

			const result = await repository.update(created.id, input);

			expect(result.name).toBe("New Name");
			expect(result.language).toBe("en");
			expect(result.aliases).toEqual(["new", "alias"]);
			expect(result.description).toBe("Updated description");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should update only specified fields", async () => {
			const created = await repository.create({
				name: "Original Name",
				language: "zh",
				description: "Original description",
			});

			const result = await repository.update(created.id, { name: "Updated Name" });

			expect(result.name).toBe("Updated Name");
			expect(result.language).toBe("zh");
			expect(result.description).toBe("Original description");
		});
	});

	describe("softDelete", () => {
		test("should soft delete an artist", async () => {
			const created = await repository.create({ name: "Artist to Delete" });

			await repository.softDelete(created.id);

			const result = await repository.getById(created.id);
			expect(result).toBeNull();
		});
	});
});
