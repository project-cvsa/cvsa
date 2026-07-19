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
		nextConfig.bindings[0].adapterIds[0] = "old";
		nextAdapters.clear();

		expect(await scheduler.execute(request())).toMatchObject({ adapterId: "new" });
	});
});
