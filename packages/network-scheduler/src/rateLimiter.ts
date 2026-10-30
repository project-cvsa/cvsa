import IORedis from "ioredis";
import type { AdaptiveRateConfig } from "./dto";
import type { AdaptiveRateState, NetworkRateLimiter } from "./contracts";

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
return { allowed, tokens }
`;

/**
 * The narrow slice of the Redis client the limiter needs. Depending on this
 * instead of the full `ioredis` type keeps the limiter's Redis contract
 * (script, key layout, arguments, reply shape) testable without a live server.
 */
export interface NetworkRateLimiterRedisClient {
	eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
	quit(): Promise<unknown>;
}

export class RedisRateLimiter implements NetworkRateLimiter {
	constructor(private readonly redis: NetworkRateLimiterRedisClient) {}

	private readAdaptive(value: unknown): AdaptiveRateState {
		if (!Array.isArray(value)) throw new Error("Invalid Redis adaptive response");
		const factor = Number(value[0]);
		const successes = Number(value[1]);
		const last = Number(value[2]);
		if (!Number.isFinite(factor) || !Number.isFinite(successes) || !Number.isFinite(last))
			throw new Error("Invalid Redis adaptive response");
		return { factor, successes, lastThrottledAt: last > 0 ? last : null };
	}

	async getAdaptiveState(scope: string): Promise<AdaptiveRateState> {
		return this.readAdaptive(
			await this.redis.eval(
				`local state = redis.call('HMGET', KEYS[1], 'factor', 'successes', 'last')
return {state[1] or '1', state[2] or '0', state[3] or '0'}`,
				1,
				`cvsa:crawler:adaptive:${scope}`
			)
		);
	}

	async recordAdaptiveOutcome(
		scope: string,
		throttled: boolean,
		policy: AdaptiveRateConfig
	): Promise<AdaptiveRateState> {
		return this.readAdaptive(
			await this.redis.eval(
				`local state = redis.call('HMGET', KEYS[1], 'factor', 'successes', 'last')
local factor = tonumber(state[1]) or 1
local successes = tonumber(state[2]) or 0
local last = tonumber(state[3]) or 0
if ARGV[1] == '1' then
 factor = math.max(tonumber(ARGV[2]), factor * tonumber(ARGV[3]))
 successes = 0
 local time = redis.call('TIME')
 last = tonumber(time[1])*1000 + math.floor(tonumber(time[2])/1000)
else
 successes = successes + 1
 if successes >= tonumber(ARGV[5]) then
  factor = math.min(1, factor + tonumber(ARGV[4]))
  successes = 0
 end
end
redis.call('HSET', KEYS[1], 'factor', factor, 'successes', successes, 'last', last)
return {tostring(factor), tostring(successes), tostring(last)}`,
				1,
				`cvsa:crawler:adaptive:${scope}`,
				throttled ? 1 : 0,
				policy.minFactor,
				policy.decreaseFactor,
				policy.recoveryStep,
				policy.recoverySuccesses
			)
		);
	}

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
			Math.ceil(durationSeconds * 2)
		);

		return Array.isArray(result) && result[0] === 1;
	}

	async reserve(
		scope: string,
		budgets: ReadonlyArray<{ scope?: string; durationSeconds: number; maxRequests: number }>
	): Promise<number> {
		const result = await this.redis.eval(
			`
local time = redis.call('TIME')
local now = tonumber(time[1]) + tonumber(time[2]) / 1000000
local wait = 0
local tokens = {}
for i = 1, #KEYS do
 local capacity = tonumber(ARGV[(i-1)*2+1])
 local duration = tonumber(ARGV[(i-1)*2+2])
 local bucket = redis.call('HMGET', KEYS[i], 'tokens', 'last_refill')
 local current = tonumber(bucket[1]) or capacity
 local last = tonumber(bucket[2]) or now
 tokens[i] = math.min(capacity, current + math.max(0, now-last) * capacity/duration)
 local ttl = math.max(1000, math.ceil(duration*2000))
 if redis.call('EXISTS', KEYS[i]) == 1 and redis.call('PTTL', KEYS[i]) < ttl then redis.call('PEXPIRE', KEYS[i], ttl) end
 if tokens[i] < 1 then wait = math.max(wait, math.ceil((1-tokens[i])*duration/capacity*1000)) end
end
if wait > 0 then return wait end
for i = 1, #KEYS do
 redis.call('HSET', KEYS[i], 'tokens', tokens[i]-1, 'last_refill', now)
 redis.call('PEXPIRE', KEYS[i], math.max(1000, math.ceil(tonumber(ARGV[(i-1)*2+2])*2000)))
end
return 0`,
			budgets.length,
			...budgets.map(
				(budget, index) =>
					`cvsa:crawler:admission:${budget.scope ?? scope}:${budget.scope ? "quota" : index}`
			),
			...budgets.flatMap((budget) => [budget.maxRequests, budget.durationSeconds])
		);
		if (typeof result !== "number" || result < 0)
			throw new Error("Invalid Redis admission response");
		return result;
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
