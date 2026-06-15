import { describe, expect, test } from "bun:test";
import {
	outboxRepository,
	type CreateOutboxEntryDto,
	type PendingOutboxQueryDto,
} from "@cvsa/core";

const repository = outboxRepository;

describe("OutboxRepository Integration Tests", () => {
	describe("create", () => {
		test("should create an outbox entry with all fields", async () => {
			const input: CreateOutboxEntryDto = {
				aggregateType: "Song",
				aggregateId: 1,
				eventType: "SongCreated",
				payload: { title: "测试歌曲", artist: "测试歌手" },
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.aggregateType).toBe("Song");
			expect(result.aggregateId).toBe(1);
			expect(result.eventType).toBe("SongCreated");
			expect(result.payload).toEqual({ title: "测试歌曲", artist: "测试歌手" });
			expect(result.status).toBe("PENDING");
			expect(result.retryCount).toBe(0);
			expect(result.lastError).toBeNull();
			expect(result.nextRetryAt).toBeNull();
			expect(result.createdAt).toBeDefined();
			expect(result.processedAt).toBeNull();
		});

		test("should create an outbox entry with minimal fields (no payload)", async () => {
			const input: CreateOutboxEntryDto = {
				aggregateType: "Artist",
				aggregateId: 2,
				eventType: "ArtistUpdated",
			};

			const result = await repository.create(input);

			expect(result).toBeDefined();
			expect(result.id).toBeGreaterThan(0);
			expect(result.aggregateType).toBe("Artist");
			expect(result.aggregateId).toBe(2);
			expect(result.eventType).toBe("ArtistUpdated");
			expect(result.payload).toBeNull();
			expect(result.status).toBe("PENDING");
			expect(result.retryCount).toBe(0);
		});

		test("should default status to PENDING for new entries", async () => {
			const result = await repository.create({
				aggregateType: "Album",
				aggregateId: 3,
				eventType: "AlbumCreated",
			});

			expect(result.status).toBe("PENDING");
		});
	});

	describe("findPending", () => {
		test("should return entries with PENDING status whose nextRetryAt is null or in the past", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 10,
				eventType: "SongCreated",
			});

			const query: PendingOutboxQueryDto = { limit: 100 };
			const results = await repository.findPending(query);

			expect(results.length).toBeGreaterThanOrEqual(1);
			const found = results.find((r) => r.id === created.id);
			expect(found).toBeDefined();
			expect(found?.status).toBe("PENDING");
		});

		test("should respect the limit parameter", async () => {
			await repository.create({
				aggregateType: "Song",
				aggregateId: 100,
				eventType: "SongCreated",
			});
			await repository.create({
				aggregateType: "Song",
				aggregateId: 101,
				eventType: "SongCreated",
			});
			await repository.create({
				aggregateType: "Song",
				aggregateId: 102,
				eventType: "SongCreated",
			});

			const query: PendingOutboxQueryDto = { limit: 2 };
			const results = await repository.findPending(query);

			expect(results.length).toBeLessThanOrEqual(2);
		});

		test("should not return entries that are PROCESSED", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 200,
				eventType: "SongCreated",
			});
			await repository.markProcessed(created.id);

			const query: PendingOutboxQueryDto = { limit: 100 };
			const results = await repository.findPending(query);

			const found = results.find((r) => r.id === created.id);
			expect(found).toBeUndefined();
		});

		test("should not return entries that are PROCESSING", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 300,
				eventType: "SongCreated",
			});
			await repository.markProcessing(created.id);

			const query: PendingOutboxQueryDto = { limit: 100 };
			const results = await repository.findPending(query);

			const found = results.find((r) => r.id === created.id);
			expect(found).toBeUndefined();
		});

		test("should not return FAILED entries regardless of nextRetryAt", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 400,
				eventType: "SongCreated",
			});
			const pastRetry = new Date(Date.now() - 10000);
			await repository.markFailed(created.id, "Test error", pastRetry);

			const query: PendingOutboxQueryDto = { limit: 100 };
			const results = await repository.findPending(query);

			const found = results.find((r) => r.id === created.id);
			expect(found).toBeUndefined();
		});
	});

	describe("markProcessing", () => {
		test("should change status from PENDING to PROCESSING", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 20,
				eventType: "SongCreated",
			});

			const result = await repository.markProcessing(created.id);

			expect(result).toBeDefined();
			expect(result.id).toBe(created.id);
			expect(result.status).toBe("PROCESSING");
		});

		test("should update an existing FAILED entry to PROCESSING", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 21,
				eventType: "SongCreated",
			});
			await repository.markFailed(created.id, "Previous error", new Date(Date.now() - 1000));

			const result = await repository.markProcessing(created.id);

			expect(result.status).toBe("PROCESSING");
		});
	});

	describe("markProcessed", () => {
		test("should change status to PROCESSED and set processedAt", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 30,
				eventType: "SongCreated",
			});

			const result = await repository.markProcessed(created.id);

			expect(result).toBeDefined();
			expect(result.id).toBe(created.id);
			expect(result.status).toBe("PROCESSED");
			expect(result.processedAt).toBeDefined();
			expect(result.processedAt).not.toBeNull();
		});

		test("should not appear in findPending after being processed", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 31,
				eventType: "SongCreated",
			});
			await repository.markProcessed(created.id);

			const query: PendingOutboxQueryDto = { limit: 100 };
			const results = await repository.findPending(query);

			const found = results.find((r) => r.id === created.id);
			expect(found).toBeUndefined();
		});
	});

	describe("markFailed", () => {
		test("should set status to FAILED with lastError and nextRetryAt", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 40,
				eventType: "SongCreated",
			});
			const nextRetryAt = new Date(Date.now() + 60000);

			const result = await repository.markFailed(
				created.id,
				"Processing failed due to network error",
				nextRetryAt
			);

			expect(result).toBeDefined();
			expect(result.id).toBe(created.id);
			expect(result.status).toBe("FAILED");
			expect(result.lastError).toBe("Processing failed due to network error");
			expect(result.nextRetryAt).toBeDefined();
			expect(result.nextRetryAt).not.toBeNull();
		});

		test("should increment retryCount when marking as failed", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 41,
				eventType: "SongCreated",
			});

			const firstFail = await repository.markFailed(
				created.id,
				"First failure",
				new Date(Date.now() + 60000)
			);
			expect(firstFail.retryCount).toBe(1);

			const secondFail = await repository.markFailed(
				created.id,
				"Second failure",
				new Date(Date.now() + 120000)
			);
			expect(secondFail.retryCount).toBe(2);
		});

		test("should retain lastError from latest failure", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 42,
				eventType: "SongCreated",
			});

			await repository.markFailed(created.id, "First error", new Date(Date.now() + 60000));
			const result = await repository.markFailed(
				created.id,
				"Second error",
				new Date(Date.now() + 120000)
			);

			expect(result.lastError).toBe("Second error");
		});
	});

	describe("full lifecycle", () => {
		test("should support PENDING -> PROCESSING -> PROCESSED lifecycle", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 50,
				eventType: "SongCreated",
			});

			expect(created.status).toBe("PENDING");

			const processing = await repository.markProcessing(created.id);
			expect(processing.status).toBe("PROCESSING");

			const processed = await repository.markProcessed(created.id);
			expect(processed.status).toBe("PROCESSED");
			expect(processed.processedAt).toBeDefined();
		});

		test("should support PENDING -> PROCESSING -> FAILED -> PROCESSING -> PROCESSED lifecycle", async () => {
			const created = await repository.create({
				aggregateType: "Song",
				aggregateId: 51,
				eventType: "SongCreated",
			});

			const processing = await repository.markProcessing(created.id);
			expect(processing.status).toBe("PROCESSING");

			const failed = await repository.markFailed(
				created.id,
				"Transient error",
				new Date(Date.now() - 1000)
			);
			expect(failed.status).toBe("FAILED");
			expect(failed.retryCount).toBe(1);

			const retryProcessing = await repository.markProcessing(created.id);
			expect(retryProcessing.status).toBe("PROCESSING");

			const processed = await repository.markProcessed(created.id);
			expect(processed.status).toBe("PROCESSED");
			expect(processed.processedAt).toBeDefined();
		});
	});
});
