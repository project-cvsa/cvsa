import IORedis from "ioredis";
import type { NetworkRateLimiter } from "./contracts";

const TOKEN_BUCKET_SCRIPT = `local capacity = tonumber(ARGV[1])
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
local wait_ms = 0
if allowed == 0 then wait_ms = math.ceil((1 - tokens) / refill_rate * 1000) end
return { allowed, wait_ms }
`;

export interface NetworkRateLimiterRedisClient {
	eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
	quit(): Promise<unknown>;
}

export class RedisRateLimiter implements NetworkRateLimiter {
	constructor(
		private readonly redis: NetworkRateLimiterRedisClient,
		private readonly clock: () => number = Date.now
	) {}

	async acquireBudgets(
		scope: string,
		budgets: ReadonlyArray<{ durationSeconds: number; maxRequests: number }>
	): Promise<{ allowed: boolean; retryAfterMs: number }> {
		const unique = [
			...new Map(
				budgets.map((budget) => [`${budget.durationSeconds}:${budget.maxRequests}`, budget])
			).values(),
		];
		const keys = unique.map(
			(budget) =>
				`cvsa:crawler:network-rate:${budget.durationSeconds}:${budget.maxRequests}:${scope}`
		);
		const args = unique.flatMap((budget) => [
			Math.max(1, budget.maxRequests),
			budget.maxRequests / budget.durationSeconds,
			Math.ceil(
				(Math.max(1, budget.maxRequests) / (budget.maxRequests / budget.durationSeconds)) *
					2
			),
		]);
		const result: unknown = await this.redis.eval(
			`local now = tonumber(ARGV[1])
local wait = 0
local values = {}
for i, key in ipairs(KEYS) do
  local capacity = tonumber(ARGV[2 + (i-1)*3])
  local rate = tonumber(ARGV[3 + (i-1)*3])
  local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
  local tokens = tonumber(bucket[1]) or capacity
  local last = tonumber(bucket[2]) or now
  tokens = math.min(capacity, tokens + math.max(0, now-last)*rate)
  values[i] = tokens
  if tokens < 1 then wait = math.max(wait, math.ceil((1-tokens)/rate*1000)) end
end
if wait > 0 then return {0, wait} end
for i, key in ipairs(KEYS) do
  redis.call('HSET', key, 'tokens', values[i]-1, 'last_refill', now)
  redis.call('EXPIRE', key, tonumber(ARGV[4 + (i-1)*3]))
end
return {1, 0}`,
			keys.length,
			...keys,
			this.clock() / 1000,
			...args
		);
		if (!Array.isArray(result) || typeof result[1] !== "number")
			throw new Error("Invalid token bucket response");
		return { allowed: result[0] === 1, retryAfterMs: result[1] };
	}

	async consume(scope: string, durationSeconds: number, maxRequests: number): Promise<boolean> {
		return (await this.acquire(scope, durationSeconds, maxRequests)).allowed;
	}

	async acquire(
		scope: string,
		durationSeconds: number,
		maxRequests: number
	): Promise<{ allowed: boolean; retryAfterMs: number }> {
		if (durationSeconds <= 0 || maxRequests <= 0)
			return { allowed: false, retryAfterMs: durationSeconds * 1000 };

		const now = this.clock() / 1000;
		const refillRate = maxRequests / durationSeconds;
		const result: unknown = await this.redis.eval(
			TOKEN_BUCKET_SCRIPT,
			1,
			`cvsa:crawler:network-rate:${durationSeconds}:${maxRequests}:${scope}`,
			Math.max(1, maxRequests),
			refillRate,
			now,
			Math.ceil((Math.max(1, maxRequests) / refillRate) * 2)
		);

		if (!Array.isArray(result) || typeof result[1] !== "number")
			throw new Error("Invalid token bucket response");
		return { allowed: result[0] === 1, retryAfterMs: result[1] };
	}

	async defer(scope: string, delayMs: number): Promise<void> {
		await this.redis.eval(
			`local ttl = redis.call("PTTL", KEYS[1])
if ttl < tonumber(ARGV[1]) then redis.call("SET", KEYS[1], "1", "PX", ARGV[1]) end
return 1`,
			1,
			`cvsa:crawler:network-cooldown:${scope}`,
			Math.ceil(delayMs)
		);
	}

	async remainingDelay(scope: string): Promise<number> {
		const ttl = await this.redis.eval(
			`return redis.call("PTTL", KEYS[1])`,
			1,
			`cvsa:crawler:network-cooldown:${scope}`
		);
		return typeof ttl === "number" ? Math.max(0, ttl) : 0;
	}

	async close(): Promise<void> {
		await this.redis.quit();
	}
}

export function createRedisRateLimiter(redisUrl: string): RedisRateLimiter {
	return new RedisRateLimiter(
		new IORedis(redisUrl, { maxRetriesPerRequest: 1, commandTimeout: 3_000 })
	);
}
