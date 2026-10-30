import { expect, test } from "bun:test";
import {
	createRedisRateLimiter,
	NetworkRuntimeConfigSchema,
	NetworkScheduler,
	type NetworkRateLimiter,
	type NetworkRuntimeConfig,
} from "../src";

async function policyTest(
	policies: NetworkRuntimeConfig["requestTypePolicies"],
	verify: (send: (type: string) => Promise<boolean>) => Promise<void>
) {
	const redis = createRedisRateLimiter(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
	const namespace = crypto.randomUUID();
	const limiter: NetworkRateLimiter = {
		consume: (scope, duration, max) => redis.consume(`${namespace}:${scope}`, duration, max),
		reserve: (scope, budgets) =>
			redis.reserve(
				`${namespace}:${scope}`,
				budgets.map((budget) => ({
					...budget,
					scope: budget.scope ? `${namespace}:${budget.scope}` : undefined,
				}))
			),
	};
	const adapterId = `adapter-${namespace}`;
	const config = NetworkRuntimeConfigSchema.parse({
		adapters: [
			{
				id: adapterId,
				type: "direct",
				requestsPerSecond: 1000,
				rateLimits: [{ durationSeconds: 60, maxRequests: 4 }],
			},
		],
		bindings: [
			{ requestType: "reserved", adapterIds: [adapterId] },
			{ requestType: "shared", adapterIds: [adapterId] },
		],
		requestTypePolicies: policies,
		execution: { admissionTimeoutMs: 100 },
	});
	const scheduler = new NetworkScheduler(
		config,
		new Map([
			[
				adapterId,
				{
					id: adapterId,
					async execute() {
						return { adapterId, status: 200, headers: {}, body: "ok", durationMs: 0 };
					},
				},
			],
		]),
		limiter
	);
	try {
		await verify(
			async (type) =>
				(await scheduler.execute({ url: "https://example.test", requestType: type }))
					.errorCode === undefined
		);
	} finally {
		await redis.close();
	}
}

test("shared traffic cannot consume capacity reserved for another request class", async () => {
	await policyTest({ reserved: { reservedShare: 0.5 } }, async (send) => {
		expect(await send("shared")).toBe(true);
		expect(await send("shared")).toBe(false);
		expect(await send("reserved")).toBe(true);
		expect(await send("reserved")).toBe(false);
	});
});
test("reserved traffic can borrow unused shared capacity", async () => {
	await policyTest({ reserved: { reservedShare: 0.5 } }, async (send) => {
		expect(await send("reserved")).toBe(true);
		expect(await send("reserved")).toBe(true);
		expect(await send("reserved")).toBe(false);
	});
});
test("without reservations every request class can use the adapter budget", async () => {
	await policyTest({}, async (send) => {
		for (const type of ["reserved", "shared", "reserved", "shared"])
			expect(await send(type)).toBe(true);
		expect(await send("shared")).toBe(false);
	});
});
test("a zero reservation does not create a separate limit", async () => {
	await policyTest({ reserved: { reservedShare: 0 } }, async (send) => {
		for (let index = 0; index < 4; index++) expect(await send("reserved")).toBe(true);
		expect(await send("reserved")).toBe(false);
	});
});
test("fully reserved capacity cannot be borrowed by an unreserved request class", async () => {
	await policyTest({ reserved: { reservedShare: 1 } }, async (send) => {
		expect(await send("shared")).toBe(false);
		expect(await send("reserved")).toBe(true);
	});
});
