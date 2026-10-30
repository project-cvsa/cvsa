import { afterAll, describe, expect, test } from "bun:test";
import IORedis from "ioredis";
import {
	createRedisRateLimiter,
	NetworkRuntimeConfigSchema,
	NetworkScheduler,
	type NetworkAdapter,
	type NetworkResponse,
	type RedisRateLimiter,
} from "../src";

/**
 * The token bucket lives in a Lua script, so it can only be verified by Redis
 * running it. These tests execute the real script against the docker-compose
 * Redis and assert what the fake-client contract test cannot: how many tokens
 * come out, when they refill, and that the bucket expires.
 *
 * Every test builds its own scope so buckets never leak between runs; the script
 * sets a TTL on each key, so nothing needs flushing.
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const inspectionClient = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const limiter = createRedisRateLimiter(REDIS_URL);

function scope(): string {
	return `integration:${crypto.randomUUID()}`;
}

function bucketKey(scopeName: string, durationSeconds: number, maxRequests: number): string {
	return `cvsa:crawler:network-rate:${durationSeconds}:${maxRequests}:${scopeName}`;
}

afterAll(async () => {
	await limiter.close();
	await inspectionClient.quit();
});

describe("RedisRateLimiter against Redis", () => {
	test("hands out exactly the configured capacity inside the window", async () => {
		const target = scope();
		const results: boolean[] = [];
		for (let attempt = 0; attempt < 5; attempt += 1) {
			results.push(await limiter.consume(target, 60, 3));
		}

		expect(results).toEqual([true, true, true, false, false]);
	});

	test("refills tokens as the window elapses", async () => {
		const target = scope();
		// Four requests per second: one token every 250ms.
		for (let attempt = 0; attempt < 4; attempt += 1) {
			expect(await limiter.consume(target, 1, 4)).toBe(true);
		}
		expect(await limiter.consume(target, 1, 4)).toBe(false);

		await Bun.sleep(600);
		expect(await limiter.consume(target, 1, 4)).toBe(true);
	});

	test("keeps each scope on its own budget", async () => {
		const first = scope();
		const second = scope();

		expect(await limiter.consume(first, 60, 1)).toBe(true);
		expect(await limiter.consume(first, 60, 1)).toBe(false);
		expect(await limiter.consume(second, 60, 1)).toBe(true);
	});

	test("expires the bucket so idle scopes do not accumulate keys", async () => {
		const target = scope();
		await limiter.consume(target, 30, 10);

		const ttl = await inspectionClient.ttl(bucketKey(target, 30, 10));
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(60);
	});
});

describe("NetworkScheduler with the Redis limiter", () => {
	test("enforces the soft-reserve budget through real Redis buckets", async () => {
		const adapterId = `direct-${crypto.randomUUID().slice(0, 8)}`;
		const requestType = `test-${crypto.randomUUID().slice(0, 8)}`;
		const adapter: NetworkAdapter = {
			id: adapterId,
			async execute(): Promise<NetworkResponse> {
				return {
					adapterId,
					status: 200,
					headers: {},
					body: "{}",
					durationMs: 1,
				};
			},
		};
		// The adapter's own limit defines the pool rate (2 requests per minute), and
		// the request type reserves all of it. That leaves exactly one token in the
		// reserved bucket for the window and no shared capacity to borrow, so the
		// second call is refused by Redis rather than by any in-process state.
		const config = NetworkRuntimeConfigSchema.parse({
			adapters: [
				{
					id: adapterId,
					type: "direct",
					enabled: true,
					baseWeight: 1,
					rateLimits: [{ durationSeconds: 60, maxRequests: 2 }],
				},
			],
			bindings: [{ requestType, adapterIds: [adapterId] }],
			requestTypePolicies: { [requestType]: { reservedShare: 1 } },
		});
		const schedulerLimiter: RedisRateLimiter = createRedisRateLimiter(REDIS_URL);
		const scheduler = new NetworkScheduler(
			config,
			new Map([[adapterId, adapter]]),
			schedulerLimiter
		);

		try {
			const request = { url: "https://api.bilibili.com/x", requestType };
			expect((await scheduler.execute(request)).errorCode).toBeUndefined();

			const refused = await scheduler.execute(request);
			expect(refused.status).toBe(429);
			expect(refused.errorCode).toBe("RATE_LIMITED");
		} finally {
			await schedulerLimiter.close();
		}
	});
});

describe("shared upstream cooldown", () => {
	test("shares cooldown between limiter instances and never shortens Retry-After", async () => {
		const second = createRedisRateLimiter(REDIS_URL);
		const target = scope();
		try {
			const cooldownMs = 10000;
			const shorterMs = 100;
			await limiter.defer(target, cooldownMs);
			await second.defer(target, shorterMs);
			expect(await second.remainingDelay(target)).toBeGreaterThan(shorterMs);
			expect(await second.remainingDelay(scope())).toBe(0);
		} finally {
			await second.close();
		}
	});
});

test("throttling pauses the request class across schedulers without isolating adapters", async () => {
	const target = scope();
	let attempts = 0;
	const adapter: NetworkAdapter = {
		id: target,
		async execute() {
			attempts += 1;
			return {
				adapterId: target,
				status: 429,
				headers: { "retry-after": "120" },
				body: "",
				durationMs: 1,
				errorCode: "HTTP_429",
			};
		},
	};
	const config = NetworkRuntimeConfigSchema.parse({
		execution: { throttleScope: "request_type" },
		adapters: [{ id: "proxy", type: "direct" }],
	});
	const first = new NetworkScheduler(config, new Map([["proxy", adapter]]), limiter);
	const second = new NetworkScheduler(config, new Map([["proxy", adapter]]), limiter);
	// A unique request class avoids sharing cooldown with other tests.
	config.bindings = [{ requestType: target, adapterIds: ["proxy"] }];
	first.reload(config, new Map([["proxy", adapter]]));
	second.reload(config, new Map([["proxy", adapter]]));
	const throttled = await first.execute({ url: "https://example.com", requestType: target });
	expect(throttled.errorCode).toBe("HTTP_429");
	expect(throttled.retryAfterMs).toBe(120 * 1000);
	expect(
		(await second.execute({ url: "https://example.com", requestType: target })).errorCode
	).toBe("RATE_LIMITED");
	expect(attempts).toBe(1);
	expect(first.getAdapterStatuses()[0]?.openUntil).toBeNull();
	expect(await limiter.remainingDelay(target)).toBeGreaterThan(0);
});

test("atomic admission does not spend one budget when another refuses", async () => {
	const target = scope();
	expect(
		await limiter.reserve(target, [
			{ scope: `${target}:blocked`, durationSeconds: 60, maxRequests: 1 },
		])
	).toBe(0);
	expect(
		await limiter.reserve(target, [
			{ scope: `${target}:free`, durationSeconds: 60, maxRequests: 1 },
			{ scope: `${target}:blocked`, durationSeconds: 60, maxRequests: 1 },
		])
	).toBeGreaterThan(0);
	expect(
		await limiter.reserve(target, [
			{ scope: `${target}:free`, durationSeconds: 60, maxRequests: 1 },
		])
	).toBe(0);
});
