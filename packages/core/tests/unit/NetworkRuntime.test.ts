import { describe, expect, test } from "bun:test";
import {
	AdapterRegistry,
	FakeRateLimiter,
	INetworkRuntimeConfigRepository,
	NetworkRuntimeConfigManager,
	NetworkRuntimeConfigService,
	ReplaceNetworkRuntimeConfigRequestSchema,
	NetworkScheduler,
	type NetworkAdapter,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRuntimeConfig,
	type NetworkTransport,
} from "../../src/modules/crawler/network";

function config(overrides: Partial<NetworkRuntimeConfig> = {}): NetworkRuntimeConfig {
	return {
		adapters: [
			{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
			{ id: "direct-b", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
		],
		bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a", "direct-b"] }],
		requestTypePolicies: {},
		health: { failurePenalty: 0.5, recoveryBonus: 0.2, minWeightFactor: 0.05 },
		...overrides,
	};
}

function response(adapterId: string, errorCode?: NetworkResponse["errorCode"]): NetworkResponse {
	return {
		adapterId,
		status: errorCode ? 503 : 200,
		headers: {},
		body: "{}",
		durationMs: 1,
		errorCode,
	};
}

function randomSequence(values: number[]): () => number {
	let index = 0;
	return () => values[index++ % values.length] ?? 0;
}

class FakeAdapter implements NetworkAdapter {
	constructor(
		readonly id: string,
		private readonly results: NetworkResponse[]
	) {}

	async execute(_request: NetworkRequest): Promise<NetworkResponse> {
		return this.results.shift() ?? response(this.id);
	}
}

class FakeConfigRepository extends INetworkRuntimeConfigRepository {
	private document: { revision: number; config: unknown; updatedAt: Date } | null = null;

	async get(): Promise<{ revision: number; config: unknown; updatedAt: Date } | null> {
		return this.document;
	}

	async create(
		configValue: NetworkRuntimeConfig
	): Promise<{ revision: number; config: unknown; updatedAt: Date } | null> {
		if (this.document) return null;
		this.document = { revision: 1, config: configValue, updatedAt: new Date() };
		return this.document;
	}

	async replace(
		expectedRevision: number,
		configValue: NetworkRuntimeConfig
	): Promise<{ revision: number; config: unknown; updatedAt: Date } | null> {
		if (!this.document || this.document.revision !== expectedRevision) return null;
		this.document = {
			revision: expectedRevision + 1,
			config: configValue,
			updatedAt: new Date(),
		};
		return this.document;
	}

	setRawConfig(configValue: unknown): void {
		if (!this.document) return;
		this.document = {
			...this.document,
			revision: this.document.revision + 1,
			config: configValue,
		};
	}
}

describe("NetworkScheduler", () => {
	test("keeps proxy protocol selection in the adapter contract", async () => {
		let usedProxy: string | undefined;
		const transport: NetworkTransport = {
			async execute(_request: NetworkRequest, proxyUrl?: string): Promise<NetworkResponse> {
				usedProxy = proxyUrl;
				return response("");
			},
		};
		const adapter = new AdapterRegistry(transport).create({
			id: "socks-a",
			type: "socks-proxy",
			proxyUrl: "socks5://127.0.0.1:1080",
			enabled: true,
			baseWeight: 1,
			rateLimits: [],
		});

		await adapter.execute({ url: "https://api.bilibili.com/x", requestType: "bilibili-api" });
		expect(usedProxy).toBe("socks5://127.0.0.1:1080");
	});

	test("switches adapter within the same call after a retryable failure", async () => {
		const adapters = new Map<string, NetworkAdapter>([
			["direct-a", new FakeAdapter("direct-a", [response("direct-a", "NETWORK_FAILURE")])],
			["direct-b", new FakeAdapter("direct-b", [response("direct-b")])],
		]);
		const scheduler = new NetworkScheduler(config(), adapters, new FakeRateLimiter(), {
			random: () => 1,
		});

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x/web-interface/view",
			requestType: "bilibili-api",
		});
		expect(result.adapterId).toBe("direct-b");
	});

	test("does not penalize an application error", async () => {
		const adapters = new Map<string, NetworkAdapter>([
			[
				"direct-a",
				new FakeAdapter("direct-a", [
					response("direct-a", "APPLICATION_ERROR"),
					response("direct-a"),
				]),
			],
			["direct-b", new FakeAdapter("direct-b", [response("direct-b")])],
		]);
		const scheduler = new NetworkScheduler(config(), adapters, new FakeRateLimiter(), {
			random: randomSequence([0, 0.25]),
		});

		const first = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		const second = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(first.errorCode).toBe("APPLICATION_ERROR");
		expect(second.adapterId).toBe("direct-a");
	});

	test("enforces adapter rate limits (multi-limiter, all must pass)", async () => {
		const limiter = new FakeRateLimiter(["adapter:direct-a"]);
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [{ durationSeconds: 1, maxRequests: 10 }],
					},
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
			}),
			new Map([["direct-a", new FakeAdapter("direct-a", [response("direct-a")])]]),
			limiter,
			{ random: () => 0 }
		);

		await expect(
			scheduler.execute({
				url: "https://api.bilibili.com/x",
				requestType: "bilibili-api",
			})
		).rejects.toThrow("No available network adapter");
		expect(limiter.scopes).toContain("adapter:direct-a");
	});

	test("skips rate-limited adapter and tries the next candidate", async () => {
		const limiter = new FakeRateLimiter(["adapter:direct-a"]);
		const adapters = new Map<string, NetworkAdapter>([
			["direct-a", new FakeAdapter("direct-a", [response("direct-a")])],
			["direct-b", new FakeAdapter("direct-b", [response("direct-b")])],
		]);
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [{ durationSeconds: 1, maxRequests: 10 }],
					},
					{
						id: "direct-b",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
				],
			}),
			adapters,
			limiter,
			{ random: () => 0 }
		);

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(result.adapterId).toBe("direct-b");
	});

	test("enforces all rate limits on an adapter (AND semantics)", async () => {
		const limiter = new FakeRateLimiter(["adapter:direct-a"]);
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [
							{ durationSeconds: 1, maxRequests: 10 },
							{ durationSeconds: 60, maxRequests: 100 },
						],
					},
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
			}),
			new Map([["direct-a", new FakeAdapter("direct-a", [response("direct-a")])]]),
			limiter,
			{ random: () => 0 }
		);

		expect(
			scheduler.execute({
				url: "https://api.bilibili.com/x",
				requestType: "bilibili-api",
			})
		).rejects.toThrow("No available network adapter");
	});

	test("excludes manually disabled adapters", async () => {
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
			new Map([["direct-a", new FakeAdapter("direct-a", [response("direct-a")])]]),
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		await expect(
			scheduler.execute({
				url: "https://api.bilibili.com/x",
				requestType: "bilibili-api",
			})
		).rejects.toThrow("No available network adapter");
	});

	test("throws 503 when request type is not bound to any adapter", async () => {
		const scheduler = new NetworkScheduler(config(), new Map(), new FakeRateLimiter(), {
			random: () => 0,
		});

		await expect(
			scheduler.execute({
				url: "https://api.bilibili.com/x",
				requestType: "unknown-type",
			})
		).rejects.toThrow("No configured network route");
	});

	test("reduces adapter weight after failures but keeps it available (no cooldown)", async () => {
		const adapters = new Map<string, NetworkAdapter>([
			[
				"direct-a",
				new FakeAdapter("direct-a", [
					response("direct-a", "NETWORK_FAILURE"),
					response("direct-a", "NETWORK_FAILURE"),
					response("direct-a"),
				]),
			],
		]);
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
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
				health: { failurePenalty: 0.5, recoveryBonus: 0.2, minWeightFactor: 0 },
			}),
			adapters,
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(result.adapterId).toBe("direct-a");
		expect(result.errorCode).toBeUndefined();
	});

	test("recovers adapter weight after successful requests", async () => {
		const adapters = new Map<string, NetworkAdapter>([
			[
				"direct-a",
				new FakeAdapter("direct-a", [
					response("direct-a", "NETWORK_FAILURE"),
					response("direct-a", "NETWORK_FAILURE"),
					response("direct-a"),
					response("direct-a"),
				]),
			],
		]);
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
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
				health: { failurePenalty: 0.5, recoveryBonus: 0.5, minWeightFactor: 0 },
			}),
			adapters,
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});

		expect(result.adapterId).toBe("direct-a");
	});

	test("rejects request when soft reserve is exhausted", async () => {
		const scheduler = new NetworkScheduler(
			config({
				requestTypePolicies: {
					"bilibili-api": { reservedShare: 0 },
				},
			}),
			new Map(),
			new FakeRateLimiter(["soft-reserve:shared"]),
			{ random: () => 0 }
		);

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(result.errorCode).toBe("RATE_LIMITED");
		expect(result.status).toBe(429);
	});

	test("reserved types consume their own quota first before falling back to shared", async () => {
		const limiter = new FakeRateLimiter(["soft-reserve:reserved:bilibili-api"]);
		const scheduler = new NetworkScheduler(
			config({
				adapters: [
					{
						id: "direct-a",
						type: "direct",
						enabled: true,
						baseWeight: 1,
						rateLimits: [{ durationSeconds: 1, maxRequests: 100 }],
					},
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
				requestTypePolicies: {
					"bilibili-api": { reservedShare: 0.3 },
				},
			}),
			new Map([["direct-a", new FakeAdapter("direct-a", [response("direct-a")])]]),
			limiter,
			{ random: () => 0 }
		);

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});

		expect(result.adapterId).toBe("direct-a");
		expect(limiter.scopes).toContain("soft-reserve:reserved:bilibili-api");
		expect(limiter.scopes).toContain("soft-reserve:shared");
	});

	test("validates total reserved share does not exceed 1", () => {
		const result = ReplaceNetworkRuntimeConfigRequestSchema.safeParse({
			revision: 0,
			config: config({
				requestTypePolicies: {
					a: { reservedShare: 0.6 },
					b: { reservedShare: 0.5 },
				},
			}),
		});
		expect(result.success).toBe(false);
	});

	test("accepts valid total reserved share", () => {
		const result = ReplaceNetworkRuntimeConfigRequestSchema.safeParse({
			revision: 0,
			config: config({
				requestTypePolicies: {
					a: { reservedShare: 0.6 },
					b: { reservedShare: 0.4 },
				},
			}),
		});
		expect(result.success).toBe(true);
	});
});

describe("NetworkRuntimeConfigService", () => {
	test("accepts revision zero when creating the initial configuration", () => {
		expect(
			ReplaceNetworkRuntimeConfigRequestSchema.safeParse({ revision: 0, config: config() })
				.success
		).toBe(true);
	});

	test("uses revisions to prevent concurrent configuration writes", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);
		const created = await service.replace(0, config());
		expect(created.revision).toBe(1);
		const updated = await service.replace(1, config());
		expect(updated.revision).toBe(2);
		await expect(service.replace(1, config())).rejects.toThrow("revision conflicts");
	});
});

describe("NetworkRuntimeConfigManager", () => {
	test("does not replace a newer runtime with an older revision", async () => {
		const repository = new FakeConfigRepository();
		const manager = new NetworkRuntimeConfigManager(
			repository,
			new AdapterRegistry(),
			new FakeRateLimiter()
		);
		const service = new NetworkRuntimeConfigService(repository);
		const older = await service.replace(0, config());
		const newer = await service.replace(1, config());
		expect(manager.apply(newer)).toBe(true);
		expect(manager.apply(older)).toBe(false);
		expect(manager.getStatus()).toEqual({ ready: true, revision: 2 });
	});

	test("keeps the last valid scheduler when a later document is invalid", async () => {
		const repository = new FakeConfigRepository();
		await repository.create(config());
		const transport: NetworkTransport = {
			async execute(): Promise<NetworkResponse> {
				return response("");
			},
		};
		const manager = new NetworkRuntimeConfigManager(
			repository,
			new AdapterRegistry(transport),
			new FakeRateLimiter()
		);
		expect(await manager.load()).toBe(true);
		repository.setRawConfig({ invalid: true });
		expect(await manager.load()).toBe(false);
		const result = await manager.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(["direct-a", "direct-b"]).toContain(result.adapterId);
	});
});
