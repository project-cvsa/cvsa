import { describe, expect, it } from "bun:test";
import { type DatabaseClient, toInstant } from "@cvsa/db";
import type { ICatalogCache } from "../../src/cache";
import { SongReader } from "../../src/song/SongReader";
import type { SongDetails } from "../../src/song/songTypes";

describe("SongReader", () => {
	it("returns cached details when present in cache", async () => {
		const cachedDetails: SongDetails = {
			id: 42,
			name: "Cached Song",
			type: "ORIGINAL",
			originalSongId: null,
			language: "zh",
			localizedNames: null,
			duration: 200,
			description: "Cached desc",
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
			singers: [],
			artists: [],
			lyrics: [],
			externalLinks: [],
		};

		const mockCache: ICatalogCache = {
			get: async <T>(_key: string): Promise<T | null> => {
				return cachedDetails as unknown as T;
			},
			set: async () => {},
			delete: async () => {},
		};

		let dbCalled = false;
		const mockDb = {
			query: {
				song: {
					findFirst: async () => {
						dbCalled = true;
						return null;
					},
				},
			},
		};

		const reader = new SongReader(mockDb as unknown as DatabaseClient, mockCache);
		const result = await reader.getDetails(42);

		expect(result).toEqual(cachedDetails);
		expect(dbCalled).toBe(false);
	});

	it("fetches from DB and populates cache on cache miss", async () => {
		let cachedKey = "";
		let cachedVal: unknown = null;

		const mockCache: ICatalogCache = {
			get: async () => null,
			set: async (key, val) => {
				cachedKey = key;
				cachedVal = val;
			},
			delete: async () => {},
		};

		const dbSong = {
			id: 10,
			name: "DB Song",
			type: "ORIGINAL" as const,
			originalSongId: null,
			language: "zh",
			localizedNames: null,
			duration: 180,
			description: "DB desc",
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
			performances: [
				{
					singer: {
						id: 1,
						name: "Luo Tianyi",
						avatarUrl: null,
						description: null,
						localizedNames: null,
						localizedDescriptions: null,
						language: "zh",
						createdAt: toInstant(new Date()),
						updatedAt: toInstant(new Date()),
						deletedAt: null,
					},
					svsEngine: { name: "VOCALOID" },
					svsEngineVersion: { versionString: "3" },
				},
			],
			creations: [
				{
					artist: {
						id: 2,
						name: "Producer",
						avatarUrl: null,
						description: null,
						localizedNames: null,
						localizedDescriptions: null,
						userId: null,
						createdAt: toInstant(new Date()),
						updatedAt: toInstant(new Date()),
						deletedAt: null,
					},
					role: {
						id: 3,
						name: "Composer",
						description: null,
						createdAt: toInstant(new Date()),
						updatedAt: toInstant(new Date()),
						deletedAt: null,
					},
				},
			],
			lyrics: [],
			externalLinks: [],
		};

		const mockDb = {
			query: {
				song: {
					findFirst: async () => dbSong,
				},
			},
		};

		const reader = new SongReader(mockDb as unknown as DatabaseClient, mockCache);
		const result = await reader.getDetails(10);

		expect(result).not.toBeNull();
		expect(result?.name).toBe("DB Song");
		expect(result?.singers[0]?.engine).toBe("VOCALOID 3");
		expect(result?.artists[0]?.role?.name).toBe("Composer");
		expect(cachedKey).toBe("catalog:song:10:details");
		expect(cachedVal).toEqual(result);
	});
});
