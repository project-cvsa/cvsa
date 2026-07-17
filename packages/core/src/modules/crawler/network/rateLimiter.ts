import IORedis from "ioredis";
import type { NetworkRateLimiter } from "./contracts";

const TOKEN_BUCKET_SCRIPT = `
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
end

local elapsed = now - last_refill
if elapsed > 0 then
  tokens = math.min(capacity, tokens + (elapsed * refill_rate))
  last_refill = now
end

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', KEYS[1], ttl)
return { allowed, tokens }
`;

export class RedisRateLimiter implements NetworkRateLimiter {
	constructor(private readonly redis: IORedis) {}

	async consume(scope: string, durationSeconds: number, maxRequests: number): Promise<boolean> {
		if (durationSeconds <= 0 || maxRequests <= 0) return false;

		const now = Date.now() / 1000;
		const refillRate = maxRequests / durationSeconds;
		const result: unknown = await this.redis.eval(
			TOKEN_BUCKET_SCRIPT,
			1,
			`cvsa:crawler:network-rate:${durationSeconds}:${maxRequests}:${scope}`,
			maxRequests,
			refillRate,
			now,
			Math.ceil(durationSeconds * 2),
		);

		return Array.isArray(result) && result[0] === 1;
	}

	async close(): Promise<void> {
		await this.redis.quit();
	}
}

export function createRedisRateLimiter(redisUrl: string): RedisRateLimiter {
	return new RedisRateLimiter(new IORedis(redisUrl, { maxRetriesPerRequest: null }));
}
