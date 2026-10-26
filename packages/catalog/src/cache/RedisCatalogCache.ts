import Redis from "ioredis";
import type { ICatalogCache } from "./CatalogCache";

export class RedisCatalogCache implements ICatalogCache {
	private readonly redis: Redis;

	constructor(redisOrUrl?: Redis | string) {
		if (typeof redisOrUrl === "string" || !redisOrUrl) {
			this.redis = new Redis(redisOrUrl ?? "redis://127.0.0.1:6379", {
				lazyConnect: true,
				enableOfflineQueue: false,
			});
		} else {
			this.redis = redisOrUrl;
		}
	}

	async get<T>(key: string): Promise<T | null> {
		try {
			const raw = await this.redis.get(key);
			if (!raw) {
				return null;
			}
			const parsed: unknown = JSON.parse(raw);
			return parsed as T;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
		try {
			const serialized = JSON.stringify(value);
			if (ttlSeconds && ttlSeconds > 0) {
				await this.redis.set(key, serialized, "EX", ttlSeconds);
			} else {
				await this.redis.set(key, serialized);
			}
		} catch {
			// Cache write failure must never break business flow
		}
	}

	async delete(key: string): Promise<void> {
		try {
			await this.redis.del(key);
		} catch {
			// Cache deletion failure must never break business flow
		}
	}
}
