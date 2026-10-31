import { describe, expect, test } from "bun:test";
import {
	NetworkScheduler,
	type NetworkAdapter,
	type NetworkErrorCode,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRuntimeConfig,
} from "../src";
import { FakeRateLimiter } from "../src/testing";

function config(overrides: Partial<NetworkRuntimeConfig> = {}): NetworkRuntimeConfig {
	return {
		adapters: [
			{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, requestsPerSecond: 20 },
		],
		bindings: [{ requestType: "test", adapterIds: ["direct-a"] }],
		requestTypePolicies: {},
		...overrides,
	};
}

function request(): NetworkRequest {
	return { url: "https://example.com", requestType: "test" };
}

function success(adapterId: string): NetworkResponse {
	return { adapterId, status: 200, headers: {}, body: "{}", durationMs: 1 };
}

function failure(
	adapterId: string,
	errorCode: NetworkErrorCode = "NETWORK_FAILURE"
): NetworkResponse {
	return { adapterId, status: 503, headers: {}, body: "", durationMs: 1, errorCode };
}

class ControllableAdapter implements NetworkAdapter {
	private readonly queue: NetworkResponse[] = [];

	constructor(readonly id: string = "direct-a") {}

	enqueue(...responses: NetworkResponse[]): void {
		this.queue.push(...responses);
	}

	async execute(_request: NetworkRequest): Promise<NetworkResponse> {
		const next = this.queue.shift();
		if (!next) return success(this.id);
		return next;
	}
}

describe("NetworkScheduler runtime status and failover", () => {
	test("starts enabled and reports zero statistics initially", () => {
		const adapter = new ControllableAdapter();
		const scheduler = new NetworkScheduler(
			config(),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		expect(scheduler.getAdapterStatuses()).toMatchObject([
			{
				id: "direct-a",
				enabled: true,
				configuredRate: 20,
				requests: 0,
				failures: 0,
				averageDurationMs: null,
			},
		]);
	});

	test("records requests, failures, and latency statistics", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(success("direct-a"), failure("direct-a", "NETWORK_FAILURE"));
		const scheduler = new NetworkScheduler(
			config(),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		await scheduler.execute(request());
		await scheduler.execute(request());

		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			id: "direct-a",
			requests: 2,
			failures: 1,
		});
	});

	test("does not schedule disabled adapters", async () => {
		const adapter = new ControllableAdapter();
		const scheduler = new NetworkScheduler(
			config({
				adapters: [{ id: "direct-a", type: "direct", enabled: false, baseWeight: 1 }],
			}),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter()
		);

		await expect(scheduler.execute(request())).rejects.toThrow("No available network adapter");
	});

	test("fails over to second adapter on network failure", async () => {
		const first = new ControllableAdapter("a");
		first.enqueue(failure("a", "NETWORK_FAILURE"));
		const second = new ControllableAdapter("b");
		second.enqueue(success("b"));

		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{ id: "a", type: "direct", enabled: true, baseWeight: 1 },
					{ id: "b", type: "direct", enabled: true, baseWeight: 1 },
				],
				bindings: [{ requestType: "test", adapterIds: ["a", "b"] }],
			}),
			new Map([
				["a", first],
				["b", second],
			]),
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		const res = await scheduler.execute(request());
		expect(res.adapterId).toBe("b");
		expect(res.status).toBe(200);
	});

	test("reload updates adapter configurations", () => {
		const adapterA = new ControllableAdapter("a");
		const adapterB = new ControllableAdapter("b");

		const scheduler = new NetworkScheduler(
			config({ adapters: [{ id: "a", type: "direct", enabled: true, baseWeight: 1 }] }),
			new Map([["a", adapterA]]),
			new FakeRateLimiter()
		);

		scheduler.reload(
			config({
				adapters: [
					{
						id: "b",
						type: "direct",
						enabled: true,
						baseWeight: 2,
						requestsPerSecond: 10,
					},
				],
				bindings: [{ requestType: "test", adapterIds: ["b"] }],
			}),
			new Map([["b", adapterB]])
		);

		expect(scheduler.getAdapterStatuses()).toMatchObject([
			{ id: "b", enabled: true, configuredRate: 10, requests: 0 },
		]);
	});
});
