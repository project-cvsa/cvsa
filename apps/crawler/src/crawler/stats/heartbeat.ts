import Redis from "ioredis";

export interface StatsHeartbeatStore {
	write(instanceId: string, at: number): Promise<void>;
	read(instanceId: string): Promise<number | null>;
	close(): Promise<void>;
}

const KEY_PREFIX = "cvsa:crawler:stats:heartbeat:";
const TTL_MS = 120_000;

export function createRedisHeartbeatStore(redisUrl: string): StatsHeartbeatStore {
	const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
	let connecting: Promise<void> | undefined;
	const connect = async () => {
		if (redis.status === "ready") return;
		connecting ??= redis.connect().catch((error) => {
			connecting = undefined;
			throw error;
		});
		await connecting;
	};
	return {
		async write(instanceId, at) {
			await connect();
			await redis.set(`${KEY_PREFIX}${instanceId}`, String(at), "PX", TTL_MS);
		},
		async read(instanceId) {
			await connect();
			const value = await redis.get(`${KEY_PREFIX}${instanceId}`);
			return value === null ? null : Number(value);
		},
		async close() {
			await redis.quit().catch(() => redis.disconnect());
		},
	};
}

export function createMemoryHeartbeatStore(): StatsHeartbeatStore {
	const values = new Map<string, number>();
	return {
		async write(instanceId, at) {
			values.set(instanceId, at);
		},
		async read(instanceId) {
			return values.get(instanceId) ?? null;
		},
		async close() {},
	};
}
