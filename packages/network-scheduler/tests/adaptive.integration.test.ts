import { expect, test } from "bun:test";
import {
	AdaptiveRateConfigSchema,
	createRedisRateLimiter,
	NetworkRuntimeConfigSchema,
	NetworkScheduler,
	type NetworkAdapter,
	type NetworkRequest,
} from "../src";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
async function waitFor(
	check: () => boolean | Promise<boolean>,
	label: string,
	timeoutMs = 2_000
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await check()) return;
		await Bun.sleep(5);
	}
	throw new Error(`Timed out waiting for ${label}`);
}
test("adaptive reduction and gradual recovery are shared between scheduler processes", async () => {
	const first = createRedisRateLimiter(redisUrl);
	const second = createRedisRateLimiter(redisUrl);
	const scope = `adaptive-${crypto.randomUUID()}`;
	const policy = AdaptiveRateConfigSchema.parse({
		minFactor: 0.25,
		decreaseFactor: 0.5,
		recoveryStep: 0.1,
		recoverySuccesses: 2,
	});
	try {
		await first.recordAdaptiveOutcome(scope, true, policy);
		expect((await second.getAdaptiveState(scope)).factor).toBe(0.5);
		await second.recordAdaptiveOutcome(scope, true, policy);
		await first.recordAdaptiveOutcome(scope, true, policy);
		expect((await first.getAdaptiveState(scope)).factor).toBe(0.25);
		await first.recordAdaptiveOutcome(scope, false, policy);
		expect((await second.getAdaptiveState(scope)).factor).toBe(0.25);
		await second.recordAdaptiveOutcome(scope, false, policy);
		expect((await first.getAdaptiveState(scope)).factor).toBeCloseTo(0.35);
	} finally {
		await first.close();
		await second.close();
	}
});

test("changing effective rate never resets an already consumed pacing allowance", async () => {
	const limiter = createRedisRateLimiter(redisUrl);
	const scope = `pacing-${crypto.randomUUID()}`;
	try {
		expect(await limiter.reserve(scope, [{ durationSeconds: 1, maxRequests: 1 }])).toBe(0);
		expect(
			await limiter.reserve(scope, [{ durationSeconds: 10, maxRequests: 1 }])
		).toBeGreaterThan(9000);
	} finally {
		await limiter.close();
	}
});

test("throttling slows background traffic while allowing tracking to use remaining capacity", async () => {
	const first = createRedisRateLimiter(redisUrl);
	const second = createRedisRateLimiter(redisUrl);
	const id = `exit-${crypto.randomUUID()}`;
	let throttle = true;
	const calls: NetworkRequest[] = [];
	const adapter: NetworkAdapter = {
		id,
		async execute(request) {
			calls.push(request);
			const errorCode = throttle ? "HTTP_429" : undefined;
			throttle = false;
			return {
				adapterId: id,
				status: errorCode ? 429 : 200,
				body: "",
				headers: {},
				durationMs: 1,
				errorCode,
			};
		},
	};
	const config = NetworkRuntimeConfigSchema.parse({
		adapters: [{ id, type: "direct", requestsPerSecond: 50 }],
		bindings: [
			{ requestType: "search", adapterIds: [id] },
			{ requestType: "tracking", adapterIds: [id] },
		],
		execution: { admissionTimeoutMs: 0, throttleCooldownMs: 100, throttleJitterMs: 0 },
		adaptive: {
			decreaseFactor: 0.5,
			backgroundFactor: 0.01,
			backgroundPenaltyMs: 10000,
			recoverySuccesses: 100,
		},
	});
	const scheduler = new NetworkScheduler(config, new Map([[id, adapter]]), first);
	const replacement = new NetworkScheduler(config, new Map([[id, adapter]]), second);
	const search = {
		url: "https://example.test",
		requestType: "search",
		cooldownScope: "api",
		background: true,
	};
	try {
		expect((await scheduler.execute(search)).retryReason).toBe("upstream");
		await waitFor(
			async () => (await second.remainingDelay(`adapter:${id}:api`)) === 0,
			"cooldown"
		);
		expect((await replacement.execute(search)).status).toBe(200);
		// The adapter bucket refills in 40 ms; the background bucket needs seconds.
		await Bun.sleep(100);
		const refused = await replacement.execute(search);
		expect(refused.retryReason).toBe("local_capacity");
		expect(refused.retryAfterMs).toBeGreaterThan(500);
		expect(
			(
				await replacement.execute({
					url: search.url,
					requestType: "tracking",
					cooldownScope: "api",
				})
			).status
		).toBe(200);
		expect(calls).toHaveLength(3);
		expect((await replacement.getAdapterStatusesWithRates())[0]).toMatchObject({
			healthState: "healthy",
			adaptiveFactor: 0.5,
		});
	} finally {
		await first.close();
		await second.close();
	}
});
