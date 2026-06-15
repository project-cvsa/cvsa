import { describe, expect, mock, test } from "bun:test";
import { prisma } from "@cvsa/db";
import { AppError } from "../../src/error/AppError";
import { ArtistService } from "../../src/modules/catalog/artist/service";
import type { ArtistDetailsResponseDto } from "../../src/modules/catalog/artist/dto";
import type { IArtistRepository } from "../../src/modules/catalog/artist/repository.interface";
import type { OutboxService } from "../../src/modules/outbox/service";
import { createMockRepository } from "../utils";

(
	prisma as unknown as {
		$transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
	}
).$transaction = mock(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

const mockArtistDetails: ArtistDetailsResponseDto = {
	id: 1,
	name: "Test Artist",
	localizedNames: null,
	language: "zh",
	aliases: [],
	description: "A test artist",
	localizedDescriptions: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	userId: null,
};

const mockOutboxEntry = {
	id: 1,
	aggregateType: "artist" as const,
	aggregateId: 1,
	eventType: "artist.created" as const,
	payload: null,
	status: "PENDING" as const,
	retryCount: 0,
	lastError: null,
	nextRetryAt: null,
	createdAt: new Date().toISOString(),
	processedAt: null,
};

describe("ArtistService", () => {
	const mockRepository = createMockRepository<IArtistRepository>({
		getById: async (id: number) => {
			if (id === 1) {
				return mockArtistDetails;
			}
			return null;
		},
		getDetailsById: async (id: number) => {
			if (id === 1) {
				return mockArtistDetails;
			}
			return null;
		},
		create: async () => mockArtistDetails,
		update: async () => mockArtistDetails,
		softDelete: async () => {},
	});

	const mockOutboxService = {
		createEntry: mock(async () => mockOutboxEntry),
		enqueue: mock(async () => {}),
		processEntry: mock(async () => {}),
		recoverStaleEntries: mock(async () => {}),
	};

	const artistService = new ArtistService(
		mockRepository as unknown as IArtistRepository,
		mockOutboxService as unknown as OutboxService
	);

	describe("getDetails", () => {
		test("returns artist details when artist exists", async () => {
			const result = await artistService.getDetails(1);

			expect(result).toEqual(mockArtistDetails);
			expect(mockRepository.getDetailsById).toHaveBeenCalledWith(1);
		});

		test("throws NOT_FOUND error when artist does not exist", async () => {
			mockRepository.getDetailsById.mockResolvedValueOnce(null);

			expect(artistService.getDetails(999)).rejects.toThrow(AppError);
			expect(artistService.getDetails(999)).rejects.toThrow("error.artist.notfound");
			expect(artistService.getDetails(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("create", () => {
		const createInput = {
			name: "New Artist",
			language: "ja",
		};

		test("creates artist and calls outbox.createEntry and outbox.enqueue", async () => {
			const result = await artistService.create(createInput);

			expect(result).toMatchObject({
				name: "Test Artist",
				language: "zh",
			});
			expect(mockRepository.create).toHaveBeenCalledWith(createInput, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "artist",
					aggregateId: mockArtistDetails.id,
					eventType: "artist.created",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});
	});

	describe("update", () => {
		const updateInput = { name: "Updated Artist" };

		test("updates artist and calls outbox.createEntry and outbox.enqueue on success", async () => {
			const result = await artistService.update(1, updateInput);

			expect(result).toMatchObject({
				name: "Test Artist",
				language: "zh",
			});
			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.update).toHaveBeenCalledWith(1, updateInput, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "artist",
					aggregateId: 1,
					eventType: "artist.updated",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});

		test("throws NOT_FOUND error when artist does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(artistService.update(999, updateInput)).rejects.toThrow(AppError);
			expect(artistService.update(999, updateInput)).rejects.toThrow("error.artist.notfound");
			expect(artistService.update(999, updateInput)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});

	describe("delete", () => {
		test("soft deletes artist and calls outbox.createEntry and outbox.enqueue on success", async () => {
			await artistService.delete(1);

			expect(mockRepository.getById).toHaveBeenCalledWith(1);
			expect(mockRepository.softDelete).toHaveBeenCalledWith(1, expect.anything());
			expect(mockOutboxService.createEntry).toHaveBeenCalledWith(
				{
					aggregateType: "artist",
					aggregateId: 1,
					eventType: "artist.deleted",
				},
				expect.anything()
			);
			expect(mockOutboxService.enqueue).toHaveBeenCalledWith(mockOutboxEntry);
		});

		test("throws NOT_FOUND error when artist does not exist", async () => {
			mockRepository.getById.mockResolvedValueOnce(null);

			expect(artistService.delete(999)).rejects.toThrow(AppError);
			expect(artistService.delete(999)).rejects.toThrow("error.artist.notfound");
			expect(artistService.delete(999)).rejects.toMatchObject({
				code: "NOT_FOUND",
				statusCode: 404,
			});
		});
	});
});
