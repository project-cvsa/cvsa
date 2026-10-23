import { describe, expect, it } from "bun:test";
import type Redis from "ioredis";
import { RedisCatalogCache } from "../../src/cache";

describe("RedisCatalogCache", () => {
	it("gets, sets, and deletes data properly", async () => {
		const store = new Map<string, string>();
		const mockRedis: Partial<Redis> = {
			get: async (key: string) => store.get(key) ?? null,
			set: (async (key: string, value: string) => {
				store.set(key, value);
				return "OK";
			}) as unknown as Redis["set"],
			del: (async (...keys: string[]) => {
				for (const k of keys) {
					store.delete(k);
				}
				return keys.length;
			}) as unknown as Redis["del"],
		};

		const cache = new RedisCatalogCache(mockRedis as unknown as Redis);

		await cache.set("test-key", { hello: "world" }, 60);
		const cached = await cache.get<{ hello: string }>("test-key");
		expect(cached).toEqual({ hello: "world" });

		await cache.delete("test-key");
		const afterDelete = await cache.get<{ hello: string }>("test-key");
		expect(afterDelete).toBeNull();
	});

	it("swallows redis errors gracefully", async () => {
		const failingRedis: Partial<Redis> = {
			get: async () => {
				throw new Error("Redis connection dropped");
			},
			set: (async () => {
				throw new Error("Redis connection dropped");
			}) as unknown as Redis["set"],
			del: (async () => {
				throw new Error("Redis connection dropped");
			}) as unknown as Redis["del"],
		};

		const cache = new RedisCatalogCache(failingRedis as unknown as Redis);

		expect(await cache.get("any-key")).toBeNull();
		expect(async () => await cache.set("any-key", "value")).not.toThrow();
		expect(async () => await cache.delete("any-key")).not.toThrow();
	});
});
