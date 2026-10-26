import { describe, expect, test } from "bun:test";
import { RedisRateLimiter, type NetworkRateLimiterRedisClient } from "../src";

interface EvalCall {
	script: string;
	numberOfKeys: number;
	args: Array<string | number>;
}

class FakeRedisClient implements NetworkRateLimiterRedisClient {
	readonly calls: EvalCall[] = [];
	quitCalled = false;
	reply: unknown = [1, 0];

	async eval(
		script: string,
		numberOfKeys: number,
		...args: Array<string | number>
	): Promise<unknown> {
		this.calls.push({ script, numberOfKeys, args });
		return this.reply;
	}

	async quit(): Promise<unknown> {
		this.quitCalled = true;
		return "OK";
	}
}

/**
 * Contract test for the Redis limiter: this pins the wire contract (key layout,
 * arguments, reply decoding) with a fake client. The token bucket itself is a Lua
 * script that only Redis can execute, so its behaviour is covered against a live
 * server in `rateLimiter.integration.test.ts`.
 */
describe("RedisRateLimiter contract", () => {
	test("consumes the token bucket with the documented key and arguments", async () => {
		const redis = new FakeRedisClient();
		const limiter = new RedisRateLimiter(redis);

		expect(await limiter.consume("adapter:direct-a", 60, 600)).toBe(true);

		expect(redis.calls).toHaveLength(1);
		const call = redis.calls[0];
		expect(call?.numberOfKeys).toBe(1);
		// key, capacity, refill rate (requests per second), now, ttl
		expect(call?.args.slice(0, 2)).toEqual([
			"cvsa:crawler:network-rate:60:600:adapter:direct-a",
			600,
		]);
		expect(call?.args[2]).toBe(10);
		expect(typeof call?.args[3]).toBe("number");
		expect(call?.args[4]).toBe(120);
	});

	test("refills proportionally to the configured window", async () => {
		const redis = new FakeRedisClient();
		const limiter = new RedisRateLimiter(redis);

		await limiter.consume("scope", 1, 10);
		await limiter.consume("scope", 4, 2);

		expect(redis.calls[0]?.args[2]).toBe(10);
		expect(redis.calls[1]?.args[2]).toBe(0.5);
		expect(redis.calls[1]?.args[4]).toBe(8);
	});

	test("decodes the Lua reply", async () => {
		const redis = new FakeRedisClient();
		const limiter = new RedisRateLimiter(redis);

		redis.reply = [1, 3.5];
		expect(await limiter.consume("scope", 1, 10)).toBe(true);

		redis.reply = [0, 0];
		expect(await limiter.consume("scope", 1, 10)).toBe(false);

		redis.reply = "unexpected";
		expect(await limiter.consume("scope", 1, 10)).toBe(false);
	});

	test("rejects invalid budgets without touching Redis", async () => {
		const redis = new FakeRedisClient();
		const limiter = new RedisRateLimiter(redis);

		expect(await limiter.consume("scope", 0, 10)).toBe(false);
		expect(await limiter.consume("scope", 1, 0)).toBe(false);
		expect(await limiter.consume("scope", -1, -1)).toBe(false);
		expect(redis.calls).toEqual([]);
	});

	test("releases the shared Redis client on close", async () => {
		const redis = new FakeRedisClient();
		const limiter = new RedisRateLimiter(redis);

		await limiter.close();
		expect(redis.quitCalled).toBe(true);
	});
});
