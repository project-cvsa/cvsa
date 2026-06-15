import { describe, expect, test } from "bun:test";
import {
	singerRepository,
	type CreateSingerRequestDto,
	type UpdateSingerRequestDto,
} from "@cvsa/core";

const repository = singerRepository;

describe("SingerRepository Integration Tests", () => {
	describe("create", () => {
		test("should create a singer with all fields", async () => {
			const input: CreateSingerRequestDto = {
				name: "洛天依",
				avatarUrl: "https://example.com/luotianyi.jpg",
				localizedNames: { ja: "洛天依", en: "Luo Tianyi" },
				language: "zh",
				description: "A famous Chinese virtual singer developed by Shanghai Henian",
				localizedDescriptions: {
					en: "A famous Chinese virtual singer",
					ja: "有名な中国のバーチャルシンガー",
				},
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("洛天依");
			expect(result.avatarUrl).toBe("https://example.com/luotianyi.jpg");
			expect(result.localizedNames).toEqual({ ja: "洛天依", en: "Luo Tianyi" });
			expect(result.language).toBe("zh");
			expect(result.description).toBe(
				"A famous Chinese virtual singer developed by Shanghai Henian"
			);
			expect(result.localizedDescriptions).toEqual({
				en: "A famous Chinese virtual singer",
				ja: "有名な中国のバーチャルシンガー",
			});
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should create a singer with minimal fields", async () => {
			const input: CreateSingerRequestDto = {};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBeNull();
			expect(result.language).toBe("zh");
			expect(result.description).toBeNull();
			expect(result.localizedNames).toBeNull();
			expect(result.localizedDescriptions).toBeNull();
		});
	});

	describe("getById", () => {
		test("should return singer when exists", async () => {
			const created = await repository.create({ name: "乐正绫" });
			const result = await repository.getById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("乐正绫");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when singer does not exist", async () => {
			const result = await repository.getById(999999);
			expect(result).toBeNull();
		});
	});

	describe("getDetailsById", () => {
		test("should return singer details when exists", async () => {
			const created = await repository.create({
				name: "言和",
				description: "Voicebank of YANHE",
			});
			const result = await repository.getDetailsById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("言和");
			expect(result?.description).toBe("Voicebank of YANHE");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when singer does not exist", async () => {
			const result = await repository.getDetailsById(999999);
			expect(result).toBeNull();
		});
	});

	describe("update", () => {
		test("should update all fields", async () => {
			const created = await repository.create({
				name: "Old Name",
				language: "zh",
				description: "Old description",
			});

			const input: UpdateSingerRequestDto = {
				name: "New Name",
				avatarUrl: "https://example.com/new.jpg",
				language: "ja",
				description: "Updated description",
				localizedNames: { en: "New Name EN" },
				localizedDescriptions: { en: "Updated description EN" },
			};

			const result = await repository.update(created.id, input);

			expect(result.name).toBe("New Name");
			expect(result.avatarUrl).toBe("https://example.com/new.jpg");
			expect(result.language).toBe("ja");
			expect(result.description).toBe("Updated description");
			expect(result.localizedNames).toEqual({ en: "New Name EN" });
			expect(result.localizedDescriptions).toEqual({ en: "Updated description EN" });
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
		test("should soft delete a singer", async () => {
			const created = await repository.create({ name: "Singer to Delete" });

			await repository.softDelete(created.id);

			const result = await repository.getById(created.id);
			expect(result).toBeNull();
		});
	});
});
