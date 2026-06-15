import { describe, expect, mock, test, beforeEach } from "bun:test";
import { OutboxService } from "@cvsa/core/internal";
import { Prisma } from "@cvsa/db";
import type { CreateOutboxEntryDto, OutboxEntryDto } from "@cvsa/core";

const mockOutboxEntry = (overrides?: Partial<OutboxEntryDto>): OutboxEntryDto => ({
	id: 1,
	aggregateType: "Song",
	aggregateId: 42,
	eventType: "SongCreated",
	payload: null,
	status: "PENDING",
	retryCount: 0,
	lastError: null,
	nextRetryAt: null,
	createdAt: new Date().toISOString(),
	processedAt: null,
	...overrides,
});

function prismaNotFoundError(): Prisma.PrismaClientKnownRequestError {
	return new Prisma.PrismaClientKnownRequestError("Not found", {
		code: "P2025",
		clientVersion: "test",
	});
}

describe("OutboxService", () => {
	const mockRepository = {
		create: mock(async () => mockOutboxEntry()),
		findPending: mock(async () => [] as OutboxEntryDto[]),
		markProcessing: mock(async (id: number) => mockOutboxEntry({ id, status: "PROCESSING" })),
		markProcessed: mock(async (id: number) =>
			mockOutboxEntry({ id, status: "PROCESSED", processedAt: new Date().toISOString() })
		),
		markFailed: mock(async (id: number, lastError: string, nextRetryAt: Date) =>
			mockOutboxEntry({
				id,
				status: "FAILED",
				lastError,
				nextRetryAt: nextRetryAt.toISOString(),
				retryCount: 1,
			})
		),
	};

	const mockQueue = {
		add: mock(async () => {}),
	};

	const service = new OutboxService(
		mockRepository as unknown as never,
		mockQueue as unknown as never
	);

	beforeEach(() => {
		mockRepository.create.mockClear();
		mockRepository.findPending.mockClear();
		mockRepository.markProcessing.mockClear();
		mockRepository.markProcessed.mockClear();
		mockRepository.markFailed.mockClear();
		mockQueue.add.mockClear();
	});

	describe("createEntry", () => {
		test("should delegate to repository.create with input and tx", async () => {
			const input: CreateOutboxEntryDto = {
				aggregateType: "Song",
				aggregateId: 42,
				eventType: "SongCreated",
			};
			const mockTx = {} as never;

			const result = await service.createEntry(input, mockTx);

			expect(mockRepository.create).toHaveBeenCalledWith(input, mockTx);
			expect(result.id).toBe(1);
			expect(result.status).toBe("PENDING");
		});

		test("should pass payload when provided", async () => {
			const input: CreateOutboxEntryDto = {
				aggregateType: "Artist",
				aggregateId: 10,
				eventType: "ArtistUpdated",
				payload: { name: "test" },
			};
			const mockTx = {} as never;

			await service.createEntry(input, mockTx);

			expect(mockRepository.create).toHaveBeenCalledWith(input, mockTx);
		});
	});

	describe("enqueue", () => {
		test("should add entry to queue with correct job name and options", async () => {
			const entry = mockOutboxEntry();

			await service.enqueue(entry);

			expect(mockQueue.add).toHaveBeenCalledTimes(1);
			const callArgs = mockQueue.add.mock.calls[0] as unknown[];
			expect(callArgs[0]).toBe("outbox-Song-42");
			expect(callArgs[1]).toBe(entry);
			expect(callArgs[2]).toEqual({
				jobId: "outbox-1",
				attempts: 5,
				backoff: { type: "exponential", delay: 1000 },
			});
		});
	});

	describe("processEntry", () => {
		test("should mark processing, call processor, then mark processed on success", async () => {
			const processor = mock(async () => {});

			await service.processEntry(1, processor);

			expect(mockRepository.markProcessing).toHaveBeenCalledWith(1);
			expect(processor).toHaveBeenCalledWith("Song", 42, "SongCreated");
			expect(mockRepository.markProcessed).toHaveBeenCalledWith(1);
			expect(mockRepository.markFailed).not.toHaveBeenCalled();
		});

		test("should rethrow processor error when retryCount is below max retries", async () => {
			mockRepository.markProcessing.mockResolvedValueOnce(
				mockOutboxEntry({ id: 1, status: "PROCESSING", retryCount: 2 })
			);
			const processorError = new Error("Processing failed");
			const processor = mock(async () => {
				throw processorError;
			});

			const promise = service.processEntry(1, processor);

			expect(promise).rejects.toThrow("Processing failed");
			await promise.catch(() => {});
			expect(mockRepository.markProcessed).not.toHaveBeenCalled();
			expect(mockRepository.markFailed).not.toHaveBeenCalled();
		});

		test("should mark failed when retryCount reaches max retries", async () => {
			mockRepository.markProcessing.mockResolvedValueOnce(
				mockOutboxEntry({ id: 1, status: "PROCESSING", retryCount: 4 })
			);
			const processor = mock(async () => {
				throw new Error("Final failure");
			});

			await service.processEntry(1, processor);

			expect(mockRepository.markFailed).toHaveBeenCalledTimes(1);
			const failArgs = mockRepository.markFailed.mock.calls[0] as unknown[];
			expect(failArgs[0]).toBe(1);
			expect(failArgs[1]).toBe("Final failure");
			expect(mockRepository.markProcessed).not.toHaveBeenCalled();
		});

		test("should convert non-Error throws to string message", async () => {
			mockRepository.markProcessing.mockResolvedValueOnce(
				mockOutboxEntry({ id: 1, status: "PROCESSING", retryCount: 4 })
			);
			const processor = mock(async () => {
				throw "raw string error";
			});

			await service.processEntry(1, processor);

			expect(mockRepository.markFailed).toHaveBeenCalledTimes(1);
			const failArgs = mockRepository.markFailed.mock.calls[0] as unknown[];
			expect(failArgs[1]).toBe("raw string error");
		});

		test("should silently skip when entry is not found (P2025)", async () => {
			mockRepository.markProcessing.mockRejectedValueOnce(prismaNotFoundError());
			const processor = mock(async () => {});

			const promise = service.processEntry(1, processor);

			expect(promise).resolves.toBeUndefined();
			await promise;
			expect(processor).not.toHaveBeenCalled();
		});

		test("should rethrow non-P2025 errors from markProcessing", async () => {
			const otherError = new Error("DB connection failed");
			mockRepository.markProcessing.mockRejectedValueOnce(otherError);
			const processor = mock(async () => {});

			const promise = service.processEntry(1, processor);

			expect(promise).rejects.toThrow("DB connection failed");
			await promise.catch(() => {});
			expect(processor).not.toHaveBeenCalled();
		});
	});

	describe("recoverStaleEntries", () => {
		test("should find pending entries and enqueue each one", async () => {
			const entries = [
				mockOutboxEntry({ id: 1 }),
				mockOutboxEntry({ id: 2 }),
				mockOutboxEntry({ id: 3 }),
			];
			mockRepository.findPending.mockResolvedValueOnce(entries);

			await service.recoverStaleEntries(50);

			expect(mockRepository.findPending).toHaveBeenCalledWith({ limit: 50 });
			expect(mockQueue.add).toHaveBeenCalledTimes(3);
			const firstCall = mockQueue.add.mock.calls[0] as unknown as [
				string,
				OutboxEntryDto,
				unknown,
			];
			const secondCall = mockQueue.add.mock.calls[1] as unknown as [
				string,
				OutboxEntryDto,
				unknown,
			];
			const thirdCall = mockQueue.add.mock.calls[2] as unknown as [
				string,
				OutboxEntryDto,
				unknown,
			];
			expect(firstCall[0]).toBe("outbox-recover-1");
			expect(secondCall[0]).toBe("outbox-recover-2");
			expect(thirdCall[0]).toBe("outbox-recover-3");
		});

		test("should use default limit of 100", async () => {
			mockRepository.findPending.mockResolvedValueOnce([]);

			await service.recoverStaleEntries();

			expect(mockRepository.findPending).toHaveBeenCalledWith({ limit: 100 });
		});

		test("should handle empty pending entries", async () => {
			mockRepository.findPending.mockResolvedValueOnce([]);

			await service.recoverStaleEntries();

			expect(mockQueue.add).not.toHaveBeenCalled();
		});
	});
});
