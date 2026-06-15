import { describe, expect, mock, test, beforeEach } from "bun:test";
import { createOutboxProcessor, type OutboxProcessorDeps } from "../../src/outbox/processor";
import type { OutboxEntryDto } from "@cvsa/core/internal";

function makeEntry(overrides?: Partial<OutboxEntryDto>): OutboxEntryDto {
	return {
		id: 1,
		aggregateType: "song",
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
	};
}

function makeJob(entry: OutboxEntryDto) {
	return { data: entry } as never;
}

describe("createOutboxProcessor", () => {
	let capturedProcessorId: number | undefined;
	let capturedCallback: (
		aggregateType: string,
		aggregateId: number,
		eventType: string
	) => Promise<void>;

	const mockOutboxService = {
		processEntry: mock(
			async (
				id: number,
				processor: (
					aggregateType: string,
					aggregateId: number,
					eventType: string
				) => Promise<void>
			) => {
				capturedProcessorId = id;
				capturedCallback = processor;
			}
		),
	};

	const mockSongSearch = { sync: mock(async () => {}) };
	const mockArtistSearch = { sync: mock(async () => {}) };

	const deps: OutboxProcessorDeps = {
		outboxService: mockOutboxService as unknown as never,
		searchServices: {
			song: mockSongSearch,
			artist: mockArtistSearch,
		},
	};

	const processor = createOutboxProcessor(deps);

	beforeEach(() => {
		mockOutboxService.processEntry.mockClear();
		mockSongSearch.sync.mockClear();
		mockArtistSearch.sync.mockClear();
		capturedProcessorId = undefined;
	});

	test("should call outboxService.processEntry with entry.id from job", async () => {
		const entry = makeEntry({ id: 7 });
		const job = makeJob(entry);

		await processor(job);

		expect(capturedProcessorId).toBe(7);
		expect(mockOutboxService.processEntry).toHaveBeenCalledTimes(1);
	});

	test("should dispatch to song search service for aggregateType 'song'", async () => {
		const entry = makeEntry({ aggregateType: "song", aggregateId: 42 });
		const job = makeJob(entry);

		await processor(job);

		await capturedCallback("song", 42, "SongCreated");

		expect(mockSongSearch.sync).toHaveBeenCalledWith(42);
		expect(mockArtistSearch.sync).not.toHaveBeenCalled();
	});

	test("should dispatch to artist search service for aggregateType 'artist'", async () => {
		const entry = makeEntry({ aggregateType: "artist", aggregateId: 99 });
		const job = makeJob(entry);

		await processor(job);

		await capturedCallback("artist", 99, "ArtistUpdated");

		expect(mockArtistSearch.sync).toHaveBeenCalledWith(99);
		expect(mockSongSearch.sync).not.toHaveBeenCalled();
	});

	test("should throw for unknown aggregateType", async () => {
		const entry = makeEntry({ aggregateType: "unknown", aggregateId: 1 });
		const job = makeJob(entry);

		await processor(job);

		const promise = capturedCallback("unknown", 1, "UnknownEvent");

		expect(promise).rejects.toThrow("Unknown aggregate type: unknown");
		expect(mockSongSearch.sync).not.toHaveBeenCalled();
		expect(mockArtistSearch.sync).not.toHaveBeenCalled();
	});
});
