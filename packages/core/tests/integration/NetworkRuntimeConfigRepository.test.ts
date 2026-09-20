import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	NetworkRuntimeConfigDocumentSchema,
	NetworkRuntimeConfigRepository,
	NetworkRuntimeConfigSchema,
	type NetworkRuntimeConfig,
} from "@cvsa/core/crawler";
import { createSnapshotDb } from "@cvsa/snapshot-db";

/**
 * Integration tests for the crawler's persistence layer, against the real
 * snapshot database (docker-compose service `snapshot-db`). The unit tests only
 * exercise an in-memory fake, so the compare-and-swap on `revision` and the
 * primary-key conflict behaviour of `create` are verified here, where real
 * PostgreSQL semantics apply.
 *
 * The repository owns a single `default` row, so the cases are ordered and opt
 * out of `--concurrent` with `test.serial`.
 */
const snapshotDb = createSnapshotDb();
const repository = new NetworkRuntimeConfigRepository(snapshotDb.client);

function config(baseWeight = 1): NetworkRuntimeConfig {
	return {
		adapters: [{ id: "direct-a", type: "direct", enabled: true, baseWeight, rateLimits: [] }],
		bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
		requestTypePolicies: {},
	};
}

async function storedDocument() {
	const stored = await repository.get();
	expect(stored).not.toBeNull();
	return NetworkRuntimeConfigDocumentSchema.parse(stored);
}

describe("NetworkRuntimeConfigRepository Integration Tests", () => {
	beforeAll(async () => {
		await snapshotDb.client.networkRuntimeConfig.deleteMany({});
	});

	afterAll(async () => {
		await snapshotDb.client.networkRuntimeConfig.deleteMany({});
		await snapshotDb.disconnect();
	});

	test.serial("returns null before any configuration is stored", async () => {
		expect(await repository.get()).toBeNull();
	});

	test.serial("creates the default row at revision 1 and reads it back", async () => {
		const created = await repository.create(config());

		expect(created?.revision).toBe(1);
		// The repository serializes Prisma results, so `updatedAt` reaches callers
		// as an ISO string; the document schema is what coerces it back to a Date.
		expect(NetworkRuntimeConfigDocumentSchema.safeParse(created).success).toBe(true);

		const stored = await storedDocument();
		expect(stored.revision).toBe(1);
		expect(NetworkRuntimeConfigSchema.parse(stored.config)).toMatchObject({
			adapters: [{ id: "direct-a", baseWeight: 1 }],
		});
	});

	test.serial("refuses a second create instead of overwriting the document", async () => {
		expect(await repository.create(config(5))).toBeNull();

		const stored = await storedDocument();
		expect(stored.revision).toBe(1);
		expect(NetworkRuntimeConfigSchema.parse(stored.config)).toMatchObject({
			adapters: [{ id: "direct-a", baseWeight: 1 }],
		});
	});

	test.serial("rejects a replace whose expected revision is stale", async () => {
		expect(await repository.replace(0, config(5))).toBeNull();

		const stored = await storedDocument();
		expect(stored.revision).toBe(1);
	});

	test.serial("replaces at the expected revision and increments it", async () => {
		const replaced = await repository.replace(1, config(5));

		expect(replaced?.revision).toBe(2);
		const stored = await storedDocument();
		expect(stored.revision).toBe(2);
		expect(NetworkRuntimeConfigSchema.parse(stored.config)).toMatchObject({
			adapters: [{ id: "direct-a", baseWeight: 5 }],
		});
	});

	test.serial("rejects a replace that reuses the revision it just consumed", async () => {
		expect(await repository.replace(1, config(9))).toBeNull();

		const stored = await storedDocument();
		expect(stored.revision).toBe(2);
		expect(NetworkRuntimeConfigSchema.parse(stored.config)).toMatchObject({
			adapters: [{ id: "direct-a", baseWeight: 5 }],
		});
	});
});
