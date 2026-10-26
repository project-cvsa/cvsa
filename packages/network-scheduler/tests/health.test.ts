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

const HEALTH: NonNullable<NetworkRuntimeConfig["health"]> = {
	failurePenalty: 0.5,
	recoveryBonus: 0.2,
	minWeightFactor: 0.05,
	failureThreshold: 3,
	cooldownMs: 1_000,
};

class TestClock {
	private current = 0;

	readonly now = (): number => this.current;

	advance(milliseconds: number): void {
		this.current += milliseconds;
	}
}

function config(overrides: Partial<NetworkRuntimeConfig> = {}): NetworkRuntimeConfig {
	return {
		adapters: [
			{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
		],
		bindings: [{ requestType: "test", adapterIds: ["direct-a"] }],
		requestTypePolicies: {},
		health: HEALTH,
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
	startedCount = 0;
	private readonly queue: NetworkResponse[] = [];
	private readonly startedResolvers: Array<() => void> = [];
	private gate: Promise<void> | undefined;
	private releaseGate: (() => void) | undefined;

	constructor(readonly id: string = "direct-a") {}

	enqueue(...responses: NetworkResponse[]): void {
		this.queue.push(...responses);
	}

	block(): void {
		this.gate = new Promise<void>((resolve) => {
			this.releaseGate = resolve;
		});
	}

	unblock(): void {
		this.releaseGate?.();
		this.releaseGate = undefined;
		this.gate = undefined;
	}

	async execute(_request: NetworkRequest): Promise<NetworkResponse> {
		this.startedCount += 1;
		this.startedResolvers.shift()?.();
		if (this.gate) await this.gate;
		return this.queue.shift() ?? success(this.id);
	}

	async waitForStart(count: number): Promise<void> {
		while (this.startedCount < count) {
			await new Promise<void>((resolve) => this.startedResolvers.push(resolve));
		}
	}
}

function createScheduler(
	adapter: NetworkAdapter,
	clock: TestClock,
	overrides: Partial<NetworkRuntimeConfig> = {}
): NetworkScheduler {
	return new NetworkScheduler(
		config(overrides),
		new Map([[adapter.id, adapter]]),
		new FakeRateLimiter(),
		{
			clock: clock.now,
			random: () => 0,
		}
	);
}

describe("NetworkScheduler health", () => {
	test("starts healthy with full effective weight", () => {
		const adapter = new ControllableAdapter();
		const scheduler = createScheduler(adapter, new TestClock(), {
			adapters: [
				{ id: "direct-a", type: "direct", enabled: true, baseWeight: 2, rateLimits: [] },
			],
		});

		expect(scheduler.getAdapterStatuses()).toEqual([
			{
				id: "direct-a",
				enabled: true,
				healthState: "healthy",
				healthFactor: 1,
				effectiveWeight: 2,
				consecutiveFailures: 0,
				openUntil: null,
			},
		]);
	});

	test("degrades without isolating the adapter after a health-affecting failure", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a"));
		const scheduler = createScheduler(adapter, new TestClock());

		const result = await scheduler.execute(request());

		expect(result.errorCode).toBe("NETWORK_FAILURE");
		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "degraded",
			healthFactor: 0.5,
			effectiveWeight: 0.5,
			consecutiveFailures: 1,
			openUntil: null,
		});
	});

	test("does not change health for an application error", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a", "APPLICATION_ERROR"), success("direct-a"));
		const scheduler = createScheduler(adapter, new TestClock());

		const first = await scheduler.execute(request());
		const second = await scheduler.execute(request());

		expect(first.errorCode).toBe("APPLICATION_ERROR");
		expect(second.adapterId).toBe("direct-a");
		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "healthy",
			healthFactor: 1,
			consecutiveFailures: 0,
		});
	});

	test("opens the circuit after the failure threshold and stops selecting the adapter", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(
			failure("direct-a"),
			failure("direct-a"),
			failure("direct-a"),
			success("direct-a")
		);
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());

		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "open",
			consecutiveFailures: 3,
			openUntil: HEALTH.cooldownMs,
			effectiveWeight: 0,
		});
		await expect(scheduler.execute(request())).rejects.toThrow(
			"No available network adapter for request type"
		);
		expect(adapter.startedCount).toBe(3);
	});

	test("keeps the circuit open until the cooldown elapses", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a"), failure("direct-a"), failure("direct-a"));
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());

		clock.advance(HEALTH.cooldownMs - 1);
		await expect(scheduler.execute(request())).rejects.toThrow(
			"No available network adapter for request type"
		);
		expect(scheduler.getAdapterStatuses()[0]?.healthState).toBe("open");
	});

	test("recovers to healthy after a successful half-open probe", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a"), failure("direct-a"), failure("direct-a"));
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());
		clock.advance(HEALTH.cooldownMs + 1);

		expect(scheduler.getAdapterStatuses()[0]?.healthState).toBe("half-open");

		const probe = await scheduler.execute(request());

		expect(probe.errorCode).toBeUndefined();
		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "healthy",
			healthFactor: 1,
			effectiveWeight: 1,
			consecutiveFailures: 0,
			openUntil: null,
		});
	});

	test("reopens the circuit when the half-open probe fails", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(
			failure("direct-a"),
			failure("direct-a"),
			failure("direct-a"),
			failure("direct-a")
		);
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());
		clock.advance(HEALTH.cooldownMs + 1);
		await scheduler.execute(request());

		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "open",
			consecutiveFailures: 4,
			openUntil: HEALTH.cooldownMs * 2 + 1,
		});
	});

	test("closes a probed circuit when the application answers with a business error", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(
			failure("direct-a"),
			failure("direct-a"),
			failure("direct-a"),
			failure("direct-a", "APPLICATION_ERROR")
		);
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());
		clock.advance(HEALTH.cooldownMs + 1);
		await scheduler.execute(request());

		// The exit demonstrably delivered a response, so it is back in rotation —
		// but the weight is only repaired by genuine successes.
		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "degraded",
			consecutiveFailures: 3,
			openUntil: null,
		});
	});

	test("allows only one half-open probe at a time", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a"), failure("direct-a"), failure("direct-a"));
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());
		clock.advance(HEALTH.cooldownMs + 1);

		adapter.block();
		const probe = scheduler.execute(request());
		await adapter.waitForStart(4);

		await expect(scheduler.execute(request())).rejects.toThrow(
			"No available network adapter for request type"
		);

		adapter.unblock();
		expect((await probe).errorCode).toBeUndefined();
		expect(scheduler.getAdapterStatuses()[0]?.healthState).toBe("healthy");
	});

	test("reports manually disabled adapters without health degradation", async () => {
		const adapter = new ControllableAdapter();
		const scheduler = createScheduler(adapter, new TestClock(), {
			adapters: [
				{ id: "direct-a", type: "direct", enabled: false, baseWeight: 1, rateLimits: [] },
			],
		});

		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			id: "direct-a",
			enabled: false,
			healthState: "healthy",
			effectiveWeight: 0,
		});
		await expect(scheduler.execute(request())).rejects.toThrow(
			"No available network adapter for request type"
		);
	});

	test("reload keeps health for the same adapter id", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a"), failure("direct-a"), failure("direct-a"));
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());

		scheduler.reload(config(), new Map([[adapter.id, adapter]]));

		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "open",
			consecutiveFailures: 3,
			openUntil: HEALTH.cooldownMs,
		});
	});

	test("reload drops removed adapters and initializes new adapters as healthy", async () => {
		const adapter = new ControllableAdapter();
		adapter.enqueue(failure("direct-a"), failure("direct-a"), failure("direct-a"));
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		await scheduler.execute(request());
		await scheduler.execute(request());
		await scheduler.execute(request());

		const replacement = new ControllableAdapter("direct-b");
		scheduler.reload(
			{
				...config(),
				adapters: [
					{
						id: "direct-b",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
				],
				bindings: [{ requestType: "test", adapterIds: ["direct-b"] }],
			},
			new Map([["direct-b", replacement]])
		);

		expect(scheduler.getAdapterStatuses()).toEqual([
			{
				id: "direct-b",
				enabled: true,
				healthState: "healthy",
				healthFactor: 1,
				effectiveWeight: 1,
				consecutiveFailures: 0,
				openUntil: null,
			},
		]);
	});

	test("an in-flight request keeps updating the state snapshot it started with", async () => {
		const adapter = new ControllableAdapter();
		const clock = new TestClock();
		const scheduler = createScheduler(adapter, clock);

		adapter.block();
		const inFlight = scheduler.execute(request());
		await adapter.waitForStart(1);

		scheduler.reload(config(), new Map([[adapter.id, adapter]]));

		adapter.enqueue(failure("direct-a"));
		adapter.unblock();

		expect((await inFlight).errorCode).toBe("NETWORK_FAILURE");
		// The failure landed on the pre-reload snapshot, so the reloaded state is
		// still healthy until it observes a failure of its own.
		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "healthy",
			consecutiveFailures: 0,
		});
	});
});
