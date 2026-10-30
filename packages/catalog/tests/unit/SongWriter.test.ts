import { describe, expect, it } from "bun:test";
import { createUserPrincipal } from "@cvsa/authentication";
import {
	type DatabaseClient,
	type Song,
	type TxClient,
	history,
	outbox,
	toInstant,
} from "@cvsa/db";
import type { ICatalogCache } from "../../src/cache";
import { SongWriter } from "../../src/song/SongWriter";

describe("SongWriter", () => {
	it("updates song in transaction, writes history and outbox, and invalidates cache", async () => {
		const existingSong: Song = {
			id: 10,
			name: "Original Name",
			type: "ORIGINAL",
			originalSongId: null,
			language: "zh",
			localizedNames: null,
			duration: 180,
			description: "Desc",
			localizedDescriptions: null,
			bilibiliAid: null,
			bilibiliBvid: null,
			vocadbId: null,
			vcpediaId: null,
			moegirlId: null,
			coverUrl: null,
			publishedAt: null,
			createdAt: toInstant(new Date()),
			updatedAt: toInstant(new Date()),
			deletedAt: null,
		};

		let historyCreated: unknown = null;
		let outboxCreated: unknown = null;
		let invalidatedKey = "";

		const mockTx = {
			select: () => ({
				from: () => ({
					where: () => ({
						limit: async () => [existingSong],
					}),
				}),
			}),
			update: () => ({
				set: (data: Partial<Song>) => ({
					where: () => ({
						returning: async () => [{ ...existingSong, ...data }],
					}),
				}),
			}),
			insert: (table: unknown) => ({
				values: (args: unknown) => {
					if (table === history) historyCreated = args;
					if (table === outbox) outboxCreated = args;
					const chain = { returning: async () => [{ id: 1 }] };
					return Object.assign(Promise.resolve(chain), chain);
				},
			}),
		};

		const mockDb = {
			transaction: async <T>(cb: (tx: TxClient) => Promise<T>): Promise<T> => {
				return cb(mockTx as unknown as TxClient);
			},
		};

		const mockCache: ICatalogCache = {
			get: async () => null,
			set: async () => {},
			delete: async (key: string) => {
				invalidatedKey = key;
			},
		};

		const writer = new SongWriter(mockDb as unknown as DatabaseClient, mockCache);
		const actor = createUserPrincipal({
			userId: "user-editor-1",
			roles: ["editor"],
		});

		const result = await writer.update(actor, 10, {
			name: "Updated Name",
		});

		expect(result.name).toBe("Updated Name");
		expect(historyCreated).toMatchObject({
			userId: "user-editor-1",
			table: "song",
			objectId: 10,
			type: "UPDATE",
		});
		expect(outboxCreated).toMatchObject({
			aggregateType: "song",
			aggregateId: 10,
			eventType: "song.updated",
			status: "PENDING",
		});
		expect(invalidatedKey).toBe("catalog:song:10:details");
	});
});
