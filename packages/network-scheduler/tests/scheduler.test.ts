import { describe, expect, test } from "bun:test";
import {
	CrawlerExecutionConfigSchema,
	NetworkScheduler,
	NetworkSchedulerError,
	type NetworkAdapter,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRuntimeConfig,
} from "../src";
import { FakeRateLimiter } from "../src/testing";

function adapterConfig(id: string): NetworkRuntimeConfig["adapters"][number] {
	return { id, type: "direct", enabled: true, baseWeight: 1, rateLimits: [] };
}

function config(overrides: Partial<NetworkRuntimeConfig> = {}): NetworkRuntimeConfig {
	return {
		adapters: [adapterConfig("direct-a")],
		bindings: [{ requestType: "test", adapterIds: ["direct-a"] }],
		requestTypePolicies: {},
		execution: CrawlerExecutionConfigSchema.parse({ admissionTimeoutMs: 0 }),
		...overrides,
	};
}

function binding(adapterId: string): NetworkRuntimeConfig["bindings"] {
	return [{ requestType: "test", adapterIds: [adapterId] }];
}

function request(requestType?: string): NetworkRequest {
	return requestType === undefined
		? { url: "https://example.com" }
		: { url: "https://example.com", requestType };
}

function response(adapterId: string, errorCode?: NetworkResponse["errorCode"]): NetworkResponse {
	return {
		adapterId,
		status: errorCode === undefined ? 200 : 503,
		headers: {},
		body: adapterId,
		durationMs: 1,
		errorCode,
	};
}

class StaticAdapter implements NetworkAdapter {
	constructor(
		readonly id: string,
		private readonly result: NetworkResponse
	) {}

	async execute(_request: NetworkRequest): Promise<NetworkResponse> {
		return this.result;
	}
}

class BlockingAdapter implements NetworkAdapter {
	readonly id = "old";
	private readonly startedPromise: Promise<void>;
	private resolveStarted: (() => void) | undefined;
	private readonly releasePromise: Promise<void>;
	private resolveRelease: (() => void) | undefined;

	constructor() {
		this.startedPromise = new Promise((resolve) => {
			this.resolveStarted = resolve;
		});
		this.releasePromise = new Promise((resolve) => {
			this.resolveRelease = resolve;
		});
	}

	async execute(_request: NetworkRequest): Promise<NetworkResponse> {
		this.resolveStarted?.();
		await this.releasePromise;
		return response(this.id);
	}

	waitUntilStarted(): Promise<void> {
		return this.startedPromise;
	}

	release(): void {
		this.resolveRelease?.();
	}
}

describe("NetworkScheduler.reload", () => {
	test("updates routing without replacing the scheduler instance", async () => {
		const oldAdapter = new StaticAdapter("old", response("old"));
		const newAdapter = new StaticAdapter("new", response("new"));
		const scheduler = new NetworkScheduler(
			config({ adapters: [adapterConfig("old")], bindings: binding("old") }),
			new Map([[oldAdapter.id, oldAdapter]]),
			new FakeRateLimiter()
		);

		scheduler.reload(
			config({ adapters: [adapterConfig("new")], bindings: binding("new") }),
			new Map([[newAdapter.id, newAdapter]])
		);

		expect(await scheduler.execute(request("test"))).toMatchObject({ adapterId: "new" });
	});

	test("keeps an in-flight request on the state it started with", async () => {
		const oldAdapter = new BlockingAdapter();
		const newAdapter = new StaticAdapter("new", response("new"));
		const scheduler = new NetworkScheduler(
			config({ adapters: [adapterConfig("old")], bindings: binding("old") }),
			new Map([[oldAdapter.id, oldAdapter]]),
			new FakeRateLimiter()
		);

		const oldRequest = scheduler.execute(request("test"));
		await oldAdapter.waitUntilStarted();
		scheduler.reload(
			config({ adapters: [adapterConfig("new")], bindings: binding("new") }),
			new Map([[newAdapter.id, newAdapter]])
		);

		expect(await scheduler.execute(request("test"))).toMatchObject({ adapterId: "new" });
		oldAdapter.release();
		expect(await oldRequest).toMatchObject({ adapterId: "old" });
	});

	test("keeps an internal snapshot of the reload inputs", async () => {
		const newAdapter = new StaticAdapter("new", response("new"));
		const nextConfig = config({ adapters: [adapterConfig("new")], bindings: binding("new") });
		const nextAdapters = new Map([[newAdapter.id, newAdapter]]);
		const scheduler = new NetworkScheduler(
			config({ adapters: [adapterConfig("old")], bindings: binding("old") }),
			new Map([["old", new StaticAdapter("old", response("old"))]]),
			new FakeRateLimiter()
		);

		scheduler.reload(nextConfig, nextAdapters);
		nextConfig.bindings?.[0]?.adapterIds.splice(0, 1, "old");
		nextAdapters.clear();

		expect(await scheduler.execute(request("test"))).toMatchObject({ adapterId: "new" });
	});
});

describe("NetworkScheduler routing", () => {
	test("routes to the bound adapters for a known request type", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			config(),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		expect(await scheduler.execute(request("test"))).toMatchObject({ adapterId: "direct-a" });
	});

	test("rejects a request type that has no explicit binding", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			config({ bindings: [{ requestType: "other-type", adapterIds: ["direct-a"] }] }),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		await expect(scheduler.execute(request("unmatched-type"))).rejects.toThrow(
			NetworkSchedulerError
		);
		await expect(scheduler.execute(request("unmatched-type"))).rejects.toThrow(
			"No adapter binding for request type: unmatched-type"
		);
	});

	test("rejects a request type when no bindings are configured at all", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			config({ bindings: undefined }),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		await expect(scheduler.execute(request("test"))).rejects.toThrow(
			"No adapter binding for request type: test"
		);
	});

	test("routes across all enabled adapters when no request type is given", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			config({ bindings: undefined }),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		// Documented compatibility behaviour: an untyped request bypasses bindings.
		expect(await scheduler.execute(request())).toMatchObject({ adapterId: "direct-a" });
	});

	test("only selects bound adapters, never every configured adapter", async () => {
		const bound = new StaticAdapter("bound", response("bound"));
		const unbound = new StaticAdapter("unbound", response("unbound"));
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{ id: "bound", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
					{ id: "unbound", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
				],
				bindings: [{ requestType: "test", adapterIds: ["bound"] }],
			}),
			new Map([
				[bound.id, bound],
				[unbound.id, unbound],
			]),
			new FakeRateLimiter()
		);

		const result = await scheduler.execute(request("test"));
		expect(result.adapterId).toBe("bound");
	});

	test("skips disabled adapters in default routing", async () => {
		const enabled = new StaticAdapter("enabled", response("enabled"));
		const disabled = new StaticAdapter("disabled", response("disabled"));
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "disabled",
						type: "direct",
						enabled: false,
						baseWeight: 1,
						rateLimits: [],
					},
					{ id: "enabled", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
				],
				bindings: undefined,
			}),
			new Map([
				[enabled.id, enabled],
				[disabled.id, disabled],
			]),
			new FakeRateLimiter()
		);

		expect(await scheduler.execute(request())).toMatchObject({ adapterId: "enabled" });
	});

	test("throws when no adapter is available in default routing", async () => {
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "disabled",
						type: "direct",
						enabled: false,
						baseWeight: 1,
						rateLimits: [],
					},
				],
				bindings: undefined,
			}),
			new Map(),
			new FakeRateLimiter()
		);

		await expect(scheduler.execute(request())).rejects.toThrow("No available network adapter");
	});

	test("throws when every bound adapter is unavailable", async () => {
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: false,
						baseWeight: 1,
						rateLimits: [],
					},
				],
			}),
			new Map(),
			new FakeRateLimiter()
		);

		await expect(scheduler.execute(request("test"))).rejects.toThrow(
			"No available network adapter for request type"
		);
	});

	test("answers 429 instead of throwing when an adapter budget refuses the only candidate", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [{ durationSeconds: 1, maxRequests: 1 }],
					},
				],
			}),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter(["adapter:direct-a"])
		);

		const result = await scheduler.execute(request("test"));

		expect(result.status).toBe(429);
		expect(result.errorCode).toBe("RATE_LIMITED");
		// No adapter carried the request, so the answer names none.
		expect(result.adapterId).toBe("");
	});

	test("prefers a real retryable answer over the synthetic rate limit", async () => {
		const failing = new StaticAdapter("direct-a", response("direct-a", "NETWORK_FAILURE"));
		const limited = new StaticAdapter("direct-b", response("direct-b"));
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
					{
						id: "direct-b",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [{ durationSeconds: 1, maxRequests: 1 }],
					},
				],
				bindings: [{ requestType: "test", adapterIds: ["direct-a", "direct-b"] }],
			}),
			new Map([
				[failing.id, failing],
				[limited.id, limited],
			]),
			new FakeRateLimiter(["adapter:direct-b"]),
			{ random: () => 0 }
		);

		const result = await scheduler.execute(request("test"));

		expect(result.adapterId).toBe("direct-a");
		expect(result.errorCode).toBe("NETWORK_FAILURE");
	});
});
