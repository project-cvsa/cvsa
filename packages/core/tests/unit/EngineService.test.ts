import { describe, expect, test } from "bun:test";
import { AppError } from "../../src/error/AppError";
import { EngineService } from "../../src/modules/catalog/engine/service";
import type { EngineDetailsResponseDto } from "../../src/modules/catalog/engine/dto";
import type { IEngineRepository } from "../../src/modules/catalog/engine/repository.interface";
import { createMockRepository } from "../utils";

const mockEngineDetails: EngineDetailsResponseDto = {
	id: 1,
	name: "Test Engine",
	description: "A test engine",
	localizedDescriptions: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

describe("EngineService", () => {
	const mockRepository = createMockRepository<IEngineRepository>({
		getById: async (id: number) => {
			if (id === 1) {
				return mockEngineDetails;
			}
			return null;
		},
		getDetailsById: async (id: number) => {
			if (id === 1) {
				return mockEngineDetails;
			}
			return null;
		},
		create: async () => mockEngineDetails,
		update: async () => mockEngineDetails,
		softDelete: async () => {},
	});

	const engineService = new EngineService(mockRepository as unknown as IEngineRepository);

	describe("getDetails", () => {
		test("returns engine details when engine exists", async () => {
			const result = await engineService.getDetails(1);

			expect(result).toEqual(mockEngineDetails);
			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when engine does not exist", async () => {
			mockRepository.getDetailsById.mockResolvedValueOnce(null);

			expect(engineService.getDetails(999)).rejects.toThrow(AppError);
			expect(engineService.getDetails(999)).rejects.toThrow("error.engine.notfound");
			expect(engineService.getDetails(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("create", () => {
		const createInput = {
			name: "New Engine",
			description: "A new test engine",
		};

		test("creates engine and returns result", async () => {
			const result = await engineService.create(createInput);

			expect(result).toMatchObject({
				name: "Test Engine",
				description: "A test engine",
			});
			expect(mockRepository.create).toHaveBeenCalledWith(createInput);
		});
	});

	describe("update", () => {
		const updateInput = { name: "Updated Engine" };

		test("updates engine on success", async () => {
			const result = await engineService.update(1, updateInput);

			expect(result).toMatchObject({
				name: "Test Engine",
				description: "A test engine",
			});
			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.update).toHaveBeenCalledWith(1, updateInput);
		});

		test("throws NOT_FOUND error when engine does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(engineService.update(999, updateInput)).rejects.toThrow(AppError);
			expect(engineService.update(999, updateInput)).rejects.toThrow("error.engine.notfound");
			expect(engineService.update(999, updateInput)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("delete", () => {
		test("soft deletes engine on success", async () => {
			await engineService.delete(1);

			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.softDelete).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when engine does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(engineService.delete(999)).rejects.toThrow(AppError);
			expect(engineService.delete(999)).rejects.toThrow("error.engine.notfound");
			expect(engineService.delete(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});
});
