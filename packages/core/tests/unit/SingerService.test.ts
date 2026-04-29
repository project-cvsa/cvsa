import { describe, expect, mock, test } from "bun:test";
import { prisma } from "@cvsa/db";
import { AppError } from "../../src/error/AppError";
import { SingerService } from "../../src/modules/catalog/singer/service";
import type { SingerDetailsResponseDto } from "../../src/modules/catalog/singer/dto";
import type { ISingerRepository } from "../../src/modules/catalog/singer/repository.interface";
import type { OutboxService } from "../../src/modules/outbox/service";
import { createMockRepository } from "../utils";

(
	prisma as unknown as {
		$transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
	}
).$transaction = mock(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

const mockSingerDetails: SingerDetailsResponseDto = {
	id: 1,
	name: "Test Singer",
	avatarUrl: null,
	language: "zh",
	localizedNames: null,
	description: "A test singer",
	localizedDescriptions: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

const mockOutboxEntry = {
	id: 1,
	aggregateType: "singer" as const,
	aggregateId: 1,
	eventType: "singer.created" as const,
	payload: null,
	status: "PENDING" as const,
	retryCount: 0,
	lastError: null,
	nextRetryAt: null,
	createdAt: new Date().toISOString(),
	processedAt: null,
};

describe("SingerService", () => {
	const mockRepository = createMockRepository<ISingerRepository>({
		getById: async (id: number) => {
			if (id === 1) {
				return mockSingerDetails;
			}
			return null;
		},
		getDetailsById: async (id: number) => {
			if (id === 1) {
				return mockSingerDetails;
			}
			return null;
		},
		create: async () => mockSingerDetails,
		update: async () => mockSingerDetails,
		softDelete: async () => {},
	});

	const mockOutboxService = {
		createEntry: mock(async () => mockOutboxEntry),
		enqueue: mock(async () => {}),
		processEntry: mock(async () => {}),
		recoverStaleEntries: mock(async () => {}),
	};

	const singerService = new SingerService(
		mockRepository as unknown as ISingerRepository,
		mockOutboxService as unknown as OutboxService
	);

	describe("getDetails", () => {
		test("returns singer details when singer exists", async () => {
			const result = await singerService.getDetails(1);

			expect(result).toEqual(mockSingerDetails);
			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when singer does not exist", async () => {
			mockRepository.getDetailsById.mockResolvedValueOnce(null);

			expect(singerService.getDetails(999)).rejects.toThrow(AppError);
			expect(singerService.getDetails(999)).rejects.toThrow("error.singer.notfound");
			expect(singerService.getDetails(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("create", () => {
		const createInput = {
			name: "New Singer",
			language: "ja",
		};

		test("creates singer and calls outbox.createEntry and outbox.enqueue", async () => {
			const result = await singerService.create(createInput);

			expect(result).toMatchObject({
				name: "Test Singer",
				language: "zh",
			});
			expect(mockRepository.create).toHaveBeenCalledWith(createInput, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "singer",
					aggregateId: mockSingerDetails.id,
					eventType: "singer.created",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});
	});

	describe("update", () => {
		const updateInput = { name: "Updated Singer" };

		test("updates singer and calls outbox.createEntry and outbox.enqueue on success", async () => {
			const result = await singerService.update(1, updateInput);

			expect(result).toMatchObject({
				name: "Test Singer",
				language: "zh",
			});
			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.update).toHaveBeenCalledWith(1, updateInput, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "singer",
					aggregateId: 1,
					eventType: "singer.updated",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});

		test("throws NOT_FOUND error when singer does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(singerService.update(999, updateInput)).rejects.toThrow(AppError);
			expect(singerService.update(999, updateInput)).rejects.toThrow("error.singer.notfound");
			expect(singerService.update(999, updateInput)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("delete", () => {
		test("soft deletes singer and calls outbox.createEntry and outbox.enqueue on success", async () => {
			await singerService.delete(1);

			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.softDelete).toHaveBeenCalledWith(1, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "singer",
					aggregateId: 1,
					eventType: "singer.deleted",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});

		test("throws NOT_FOUND error when singer does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(singerService.delete(999)).rejects.toThrow(AppError);
			expect(singerService.delete(999)).rejects.toThrow("error.singer.notfound");
			expect(singerService.delete(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});
});
