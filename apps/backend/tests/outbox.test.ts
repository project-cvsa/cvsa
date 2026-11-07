import { describe, expect, test } from "bun:test";
import { db, outbox, Temporal } from "@cvsa/db";
import { eq, inArray } from "drizzle-orm";
import { OutboxRepository } from "../src/outbox/repository";
import { OutboxService } from "../src/outbox/service";

describe("Outbox Module Tests", () => {
	const repository = new OutboxRepository(db);
	const createdIds: number[] = [];

	async function cleanup() {
		if (createdIds.length > 0) {
			await db.delete(outbox).where(inArray(outbox.id, createdIds));
			createdIds.length = 0;
		}
	}

	test("creates an outbox entry in PENDING state", async () => {
		const entry = await repository.create({
			aggregateType: "artist",
			aggregateId: 1001,
			eventType: "CREATE",
			payload: { name: "Test Artist" },
		});
		createdIds.push(entry.id);

		expect(entry.id).toBeGreaterThan(0);
		expect(entry.status).toBe("PENDING");
		expect(entry.aggregateType).toBe("artist");
		expect(entry.aggregateId).toBe(1001);
		expect(entry.retryCount).toBe(0);
		expect(entry.processedAt).toBeNull();
	});

	test("markProcessing sets status to PROCESSING with a 5-minute lease", async () => {
		const entry = await repository.create({
			aggregateType: "song",
			aggregateId: 2001,
			eventType: "UPDATE",
		});
		createdIds.push(entry.id);

		const before = Temporal.Now.instant();
		const processing = await repository.markProcessing(entry.id);
		expect(processing.status).toBe("PROCESSING");
		expect(processing.nextRetryAt).not.toBeNull();
		if (processing.nextRetryAt) {
			const diffSeconds =
				Temporal.Instant.from(processing.nextRetryAt).epochMilliseconds / 1000 -
				before.epochMilliseconds / 1000;
			expect(diffSeconds).toBeGreaterThan(250);
			expect(diffSeconds).toBeLessThan(350);
		}
	});

	test("markProcessed sets status to PROCESSED and sets processedAt", async () => {
		const entry = await repository.create({
			aggregateType: "singer",
			aggregateId: 3001,
			eventType: "DELETE",
		});
		createdIds.push(entry.id);

		await repository.markProcessing(entry.id);
		const processed = await repository.markProcessed(entry.id);
		expect(processed.status).toBe("PROCESSED");
		expect(processed.processedAt).not.toBeNull();
	});

	test("recordFailure preserves PENDING status, updates error and retry count", async () => {
		const entry = await repository.create({
			aggregateType: "song",
			aggregateId: 4001,
			eventType: "SYNC",
		});
		createdIds.push(entry.id);

		const nextRetry = new Date(Date.now() + 5000);
		const failed = await repository.recordFailure(entry.id, "Network timeout", 1, nextRetry);
		expect(failed.status).toBe("PENDING");
		expect(failed.retryCount).toBe(1);
		expect(failed.lastError).toBe("Network timeout");
		expect(failed.nextRetryAt).not.toBeNull();
	});

	test("findPending finds due pending items and stale processing leases", async () => {
		const past = new Date(Date.now() - 10_000);
		const future = new Date(Date.now() + 600_000);

		const due = await repository.create({
			aggregateType: "artist",
			aggregateId: 5001,
			eventType: "UPDATE",
		});
		createdIds.push(due.id);
		await repository.recordFailure(due.id, "transient error", 1, past);

		const notDue = await repository.create({
			aggregateType: "artist",
			aggregateId: 5002,
			eventType: "UPDATE",
		});
		createdIds.push(notDue.id);
		await repository.recordFailure(notDue.id, "later error", 1, future);

		const pending = await repository.findPending({ limit: 50 });
		const pendingIds = pending.map((e) => e.id);
		expect(pendingIds).toContain(due.id);
		expect(pendingIds).not.toContain(notDue.id);
	});

	test("OutboxService.processEntry handles successful processing", async () => {
		const fakeQueue = {
			add: async () => {},
		};
		const service = new OutboxService(
			repository,
			fakeQueue as unknown as ConstructorParameters<typeof OutboxService>[1]
		);

		const entry = await repository.create({
			aggregateType: "artist",
			aggregateId: 6001,
			eventType: "CREATE",
		});
		createdIds.push(entry.id);

		let executed = false;
		await service.processEntry(entry.id, async (type, id, event) => {
			expect(type).toBe("artist");
			expect(id).toBe(6001);
			expect(event).toBe("CREATE");
			executed = true;
		});

		expect(executed).toBe(true);
		const [stored] = await db.select().from(outbox).where(eq(outbox.id, entry.id));
		expect(stored.status).toBe("PROCESSED");
	});

	test("OutboxService.processEntry handles retries with backoff and eventual failure", async () => {
		const fakeQueue = {
			add: async () => {},
		};
		const service = new OutboxService(
			repository,
			fakeQueue as unknown as ConstructorParameters<typeof OutboxService>[1]
		);

		const entry = await repository.create({
			aggregateType: "song",
			aggregateId: 7001,
			eventType: "UPDATE",
		});
		createdIds.push(entry.id);

		// First failure: increments retryCount to 1, status remains PENDING with backoff
		await expect(
			service.processEntry(entry.id, async () => {
				throw new Error("Temporary failure 1");
			})
		).rejects.toThrow("Temporary failure 1");

		let [stored] = await db.select().from(outbox).where(eq(outbox.id, entry.id));
		expect(stored.status).toBe("PENDING");
		expect(stored.retryCount).toBe(1);
		expect(stored.lastError).toBe("Temporary failure 1");
		expect(stored.nextRetryAt).not.toBeNull();

		// Simulate reaching MAX_RETRIES (5): should mark as FAILED without throwing, acknowledging the job
		await repository.recordFailure(entry.id, "Failure 4", 4, new Date());
		await service.processEntry(entry.id, async () => {
			throw new Error("Final failure 5");
		});

		[stored] = await db.select().from(outbox).where(eq(outbox.id, entry.id));
		expect(stored.status).toBe("FAILED");
		expect(stored.retryCount).toBe(5);
		expect(stored.lastError).toBe("Final failure 5");
	});

	test("cleanup created rows", async () => {
		await cleanup();
	});
});
