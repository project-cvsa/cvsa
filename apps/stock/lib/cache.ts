import { getRedis } from "./redis";

function mapReplacer(_key: string, value: unknown): unknown {
	if (value instanceof Map) {
		return { __map: [...value] };
	}
	return value;
}

function fullReviver(_key: string, value: unknown): unknown {
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
		const d = new Date(value);
		if (!Number.isNaN(d.getTime())) return d;
	}
	if (value && typeof value === "object" && "__map" in value) {
		return new Map((value as { __map: [unknown, unknown][] }).__map);
	}
	return value;
}

export async function withCache<T>(
	rawKey: string,
	ttlSeconds: number,
	fetcher: () => Promise<T>
): Promise<T> {
	const redis = getRedis();
	const key = `cvsa:stock:${rawKey}`;
	const cached = await redis.get(key);
	if (cached !== null) return JSON.parse(cached, fullReviver) as T;

	const result = await fetcher();
	await redis.set(key, JSON.stringify(result, mapReplacer), "EX", ttlSeconds);
	return result;
}
