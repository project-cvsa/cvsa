import Redis from "ioredis";

let instance: Redis | null = null;

export function getRedis(): Redis {
	if (instance) return instance;

	const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

	instance = new Redis(url, {
		maxRetriesPerRequest: 3,
		lazyConnect: false,
	});

	return instance;
}
