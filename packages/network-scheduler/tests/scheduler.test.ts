import { describe, expect, test } from "bun:test";
import {
	createFakeNetworkRateLimiter,
	NetworkScheduler,
	type NetworkAdapter,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRuntimeConfig,
} from "../src";

function config(adapterId: string): NetworkRuntimeConfig {
	return {
		adapters: [
			{
				id: adapterId,
				type: "direct",
				enabled: true,
				baseWeight: 1,
				rateLimits: [],
			},
		],
		bindings: [{ requestType: "test", adapterIds: [adapterId] }],
		requestTypePolicies: {},
	};
}

function request(): NetworkRequest {
	return { url: "https://example.com", requestType: "test" };
}

function response(adapterId: string): NetworkResponse {
	return {
		adapterId,
		status: 200,
		headers: {},
		body: adapterId,
		durationMs: 1,
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
			config("old"),
			new Map([[oldAdapter.id, oldAdapter]]),
			createFakeNetworkRateLimiter()
		);

		scheduler.reload(config("new"), new Map([[newAdapter.id, newAdapter]]));

		expect(await scheduler.execute(request())).toMatchObject({ adapterId: "new" });
	});

	test("keeps an in-flight request on the state it started with", async () => {
		const oldAdapter = new BlockingAdapter();
		const newAdapter = new StaticAdapter("new", response("new"));
		const scheduler = new NetworkScheduler(
			config("old"),
			new Map([[oldAdapter.id, oldAdapter]]),
			createFakeNetworkRateLimiter()
		);

		const oldRequest = scheduler.execute(request());
		await oldAdapter.waitUntilStarted();
		scheduler.reload(config("new"), new Map([[newAdapter.id, newAdapter]]));

		expect(await scheduler.execute(request())).toMatchObject({ adapterId: "new" });
		oldAdapter.release();
		expect(await oldRequest).toMatchObject({ adapterId: "old" });
	});

	test("keeps an internal snapshot of the reload inputs", async () => {
		const newAdapter = new StaticAdapter("new", response("new"));
		const nextConfig = config("new");
		const nextAdapters = new Map([[newAdapter.id, newAdapter]]);
		const scheduler = new NetworkScheduler(
			config("old"),
			new Map([["old", new StaticAdapter("old", response("old"))]]),
			createFakeNetworkRateLimiter()
		);

		scheduler.reload(nextConfig, nextAdapters);
		if (nextConfig.bindings) nextConfig.bindings[0].adapterIds[0] = "old";
		nextAdapters.clear();

		expect(await scheduler.execute(request())).toMatchObject({ adapterId: "new" });
	});
});

describe("NetworkScheduler", () => {
	test("routes to all enabled adapters when no binding is configured", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			{
				adapters: [
					{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
				],
				requestTypePolicies: {},
			},
			new Map([[adapter.id, adapter]]),
			createFakeNetworkRateLimiter()
		);

		const result = await scheduler.execute({
			url: "https://example.com",
		});
		expect(result.adapterId).toBe("direct-a");
	});

	test("falls back to all enabled adapters when requestType does not match any binding", async () => {
		const adapter = new StaticAdapter("direct-a", response("direct-a"));
		const scheduler = new NetworkScheduler(
			{
				adapters: [
					{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
				],
				bindings: [{ requestType: "other-type", adapterIds: [] }],
				requestTypePolicies: {},
			},
			new Map([[adapter.id, adapter]]),
			createFakeNetworkRateLimiter()
		);

		const result = await scheduler.execute({
			url: "https://example.com",
			requestType: "unmatched-type",
		});
		expect(result.adapterId).toBe("direct-a");
	});

	test("skips disabled adapters in fallback routing", async () => {
		const enabled = new StaticAdapter("enabled", response("enabled"));
		const disabled = new StaticAdapter("disabled", response("disabled"));
		const scheduler = new NetworkScheduler(
			{
				adapters: [
					{ id: "disabled", type: "direct", enabled: false, baseWeight: 1, rateLimits: [] },
					{ id: "enabled", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
				],
				requestTypePolicies: {},
			},
			new Map([
				[enabled.id, enabled],
				[disabled.id, disabled],
			]),
			createFakeNetworkRateLimiter()
		);

		const result = await scheduler.execute({
			url: "https://example.com",
		});
		expect(result.adapterId).toBe("enabled");
	});

	test("throws when no adapter is available in fallback mode", async () => {
		const scheduler = new NetworkScheduler(
			{
				adapters: [
					{ id: "disabled", type: "direct", enabled: false, baseWeight: 1, rateLimits: [] },
				],
				requestTypePolicies: {},
			},
			new Map(),
			createFakeNetworkRateLimiter()
		);

		await expect(
			scheduler.execute({ url: "https://example.com" })
		).rejects.toThrow("No available network adapter");
	});
});
