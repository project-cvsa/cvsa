import { appLogger } from "@cvsa/logger";
import type IORedis from "ioredis";
import type { IBilibiliCache } from "./types";

export class MemoryBilibiliCache implements IBilibiliCache {
	private readonly store = new Map<string, { value: string; expiresAt: number }>();

	async get(key: string): Promise<string | null> {
		const entry = this.store.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}
		return entry.value;
	}

	async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		this.store.set(key, {
			value,
			expiresAt: Date.now() + ttlSeconds * 1000,
		});
	}

	clear(): void {
		this.store.clear();
	}
}

export class RedisBilibiliCache implements IBilibiliCache {
	constructor(private readonly redis: IORedis) {}

	async get(key: string): Promise<string | null> {
		try {
			return await this.redis.get(key);
		} catch (error) {
			appLogger.error("Bilibili cache redis get failed", {
				component: "bilibili-cache",
				key,
				error,
			});
			return null;
		}
	}

	async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		try {
			await this.redis.set(key, value, "EX", ttlSeconds);
		} catch (error) {
			appLogger.error("Bilibili cache redis set failed", {
				component: "bilibili-cache",
				key,
				error,
			});
		}
	}
}
