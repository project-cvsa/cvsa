import { describe, expect, mock, test } from "bun:test";
import { prisma } from "@cvsa/db";
import { AppError } from "../../src/error/AppError";
import { ArtistRoleService } from "../../src/modules/catalog/artistRole/service";
import type { ArtistRoleDetailsResponseDto } from "../../src/modules/catalog/artistRole/dto";
import type { IArtistRoleRepository } from "../../src/modules/catalog/artistRole/repository.interface";
import type { OutboxService } from "../../src/modules/outbox/service";
import { createMockRepository } from "../utils";

(
	prisma as unknown as {
		$transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
	}
).$transaction = mock(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

const mockArtistRole: ArtistRoleDetailsResponseDto = {
	id: 1,
	name: "Producer",
	language: "zh",
	localizedNames: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

const mockOutboxEntry = {
	id: 1,
	aggregateType: "artistRole" as const,
	aggregateId: 1,
	eventType: "artistRole.created" as const,
	payload: null,
	status: "PENDING" as const,
	retryCount: 0,
	lastError: null,
	nextRetryAt: null,
	createdAt: new Date().toISOString(),
	processedAt: null,
};

describe("ArtistRoleService", () => {
	const mockRepository = createMockRepository<IArtistRoleRepository>({
		getById: async (id: number) => {
			if (id === 1) {
				return mockArtistRole;
			}
			return null;
		},
		getDetailsById: async (id: number) => {
			if (id === 1) {
				return mockArtistRole;
			}
			return null;
		},
		create: async () => mockArtistRole,
		update: async () => mockArtistRole,
		softDelete: async () => {},
	});

	const mockOutboxService = {
		createEntry: mock(async () => mockOutboxEntry),
		enqueue: mock(async () => {}),
		processEntry: mock(async () => {}),
		recoverStaleEntries: mock(async () => {}),
	};

	const artistRoleService = new ArtistRoleService(
		mockRepository as unknown as IArtistRoleRepository,
		mockOutboxService as unknown as OutboxService
	);

	describe("getDetails", () => {
		test("returns artist role when role exists", async () => {
			const result = await artistRoleService.getDetails(1);

			expect(result).toEqual(mockArtistRole);
			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when role does not exist", async () => {
			mockRepository.getDetailsById.mockResolvedValueOnce(null);

			expect(artistRoleService.getDetails(999)).rejects.toThrow(AppError);
			expect(artistRoleService.getDetails(999)).rejects.toThrow("error.artistRole.notfound");
			expect(artistRoleService.getDetails(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("create", () => {
		const createInput = {
			name: "Composer",
		};

		test("creates role and calls outbox.createEntry and outbox.enqueue", async () => {
			const result = await artistRoleService.create(createInput);

			expect(result).toMatchObject({
				name: "Producer",
			});
			expect(mockRepository.create).toHaveBeenCalledWith(createInput, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "artistRole",
					aggregateId: mockArtistRole.id,
					eventType: "artistRole.created",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});
	});

	describe("update", () => {
		const updateInput = { name: "Lyricist" };

		test("updates role and calls outbox.createEntry and outbox.enqueue on success", async () => {
			const result = await artistRoleService.update(1, updateInput);

			expect(result).toMatchObject({
				name: "Producer",
			});
			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.update).toHaveBeenCalledWith(1, updateInput, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "artistRole",
					aggregateId: 1,
					eventType: "artistRole.updated",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});

		test("throws NOT_FOUND error when role does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(artistRoleService.update(999, updateInput)).rejects.toThrow(AppError);
			expect(artistRoleService.update(999, updateInput)).rejects.toThrow(
				"error.artistRole.notfound"
			);
			expect(artistRoleService.update(999, updateInput)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("delete", () => {
		test("soft deletes role and calls outbox.createEntry and outbox.enqueue on success", async () => {
			await artistRoleService.delete(1);

			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.softDelete).toHaveBeenCalledWith(1, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "artistRole",
					aggregateId: 1,
					eventType: "artistRole.deleted",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});

		test("throws NOT_FOUND error when role does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(artistRoleService.delete(999)).rejects.toThrow(AppError);
			expect(artistRoleService.delete(999)).rejects.toThrow("error.artistRole.notfound");
			expect(artistRoleService.delete(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});
});
