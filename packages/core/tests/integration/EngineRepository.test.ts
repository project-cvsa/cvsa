import { describe, expect, test } from "bun:test";
import {
	engineRepository,
	type CreateEngineRequestDto,
	type UpdateEngineRequestDto,
} from "@cvsa/core";

const repository = engineRepository;

describe("EngineRepository Integration Tests", () => {
	describe("create", () => {
		test("should create an engine with all fields", async () => {
			const input: CreateEngineRequestDto = {
				name: "VOCALOID",
				description: "The latest version of VOCALOID synthesis engine",
				localizedDescriptions: {
					en: "The latest version of VOCALOID",
					ja: "VOCALOIDの最新版",
					zh: "VOCALOID最新版",
				},
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("VOCALOID");
			expect(result.description).toBe("The latest version of VOCALOID synthesis engine");
			expect(result.localizedDescriptions).toEqual({
				en: "The latest version of VOCALOID",
				ja: "VOCALOIDの最新版",
				zh: "VOCALOID最新版",
			});
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should create an engine with minimal fields (name only)", async () => {
			const input: CreateEngineRequestDto = {
				name: "Synthesizer V",
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.name).toBe("Synthesizer V");
			expect(result.description).toBeNull();
			expect(result.localizedDescriptions).toBeNull();
		});
	});

	describe("getById", () => {
		test("should return engine when exists", async () => {
			const created = await repository.create({ name: "UTAU" });
			const result = await repository.getById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("UTAU");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when engine does not exist", async () => {
			const result = await repository.getById(999999);
			expect(result).toBeNull();
		});
	});

	describe("getDetailsById", () => {
		test("should return engine details when exists", async () => {
			const created = await repository.create({
				name: "ACE Studio",
				description: "AI-powered singing synthesis engine",
			});
			const result = await repository.getDetailsById(created.id);

			expect(result).toBeDefined();
			expect(result?.id).toBe(created.id);
			expect(result?.name).toBe("ACE Studio");
			expect(result?.description).toBe("AI-powered singing synthesis engine");
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result?.deletedAt).not.toBeDefined();
		});

		test("should return null when engine does not exist", async () => {
			const result = await repository.getDetailsById(999999);
			expect(result).toBeNull();
		});
	});

	describe("update", () => {
		test("should update all fields", async () => {
			const created = await repository.create({
				name: "Old Engine",
				description: "Old description",
			});

			const input: UpdateEngineRequestDto = {
				name: "Updated Engine",
				description: "Updated description",
				localizedDescriptions: {
					en: "Updated",
				},
			};

			const result = await repository.update(created.id, input);

			expect(result.name).toBe("Updated Engine");
			expect(result.description).toBe("Updated description");
			expect(result.localizedDescriptions).toEqual({ en: "Updated" });
			//@ts-expect-error accessing nonexistent field for testing purpose
			expect(result.deletedAt).not.toBeDefined();
		});

		test("should update only specified fields", async () => {
			const created = await repository.create({
				name: "Original Engine",
				description: "Original description",
				localizedDescriptions: { zh: "原始描述" },
			});

			const result = await repository.update(created.id, { name: "Renamed Engine" });

			expect(result.name).toBe("Renamed Engine");
			expect(result.description).toBe("Original description");
			expect(result.localizedDescriptions).toEqual({ zh: "原始描述" });
		});
	});

	describe("softDelete", () => {
		test("should soft delete an engine", async () => {
			const created = await repository.create({ name: "Engine to Delete" });

			await repository.softDelete(created.id);

			const result = await repository.getById(created.id);
			expect(result).toBeNull();
		});
	});
});
