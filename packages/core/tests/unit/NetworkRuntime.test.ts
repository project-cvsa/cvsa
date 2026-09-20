import { describe, expect, test } from "bun:test";
import {
	AdapterRegistry,
	INetworkRuntimeConfigRepository,
	NetworkRuntimeConfigManager,
	NetworkRuntimeConfigService,
	NetworkRuntimeConfigSchema,
	redactNetworkRuntimeConfigDocument,
	redactProxyUrl,
	NetworkScheduler,
	type NetworkAdapter,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRuntimeConfig,
	type NetworkTransport,
} from "../../src/modules/crawler/network";
import { FakeRateLimiter } from "@cvsa/network-scheduler/testing";
import {
	NetworkRuntimeStatusSchema,
	ReplaceNetworkRuntimeConfigRequestSchema,
} from "../../src/modules/crawler/dto";

function health(): NonNullable<NetworkRuntimeConfig["health"]> {
	return {
		failurePenalty: 0.5,
		recoveryBonus: 0.2,
		minWeightFactor: 0.05,
		failureThreshold: 3,
		cooldownMs: 30_000,
	};
}

function config(overrides: Partial<NetworkRuntimeConfig> = {}): NetworkRuntimeConfig {
	return {
		adapters: [
			{ id: "direct-a", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
			{ id: "direct-b", type: "direct", enabled: true, baseWeight: 1, rateLimits: [] },
		],
		bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a", "direct-b"] }],
		requestTypePolicies: {},
		health: health(),
		...overrides,
	};
}

function response(adapterId: string, errorCode?: NetworkResponse["errorCode"]): NetworkResponse {
	return {
		adapterId,
		status: errorCode === undefined ? 200 : 503,
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

function createManager(
	repository: FakeConfigRepository,
	transport?: NetworkTransport
): NetworkRuntimeConfigManager {
	return new NetworkRuntimeConfigManager(
		repository,
		new AdapterRegistry(transport),
		new FakeRateLimiter()
	);
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
			id: "proxy-a",
			type: "http-proxy",
			proxyUrl: "http://127.0.0.1:8080",
			enabled: true,
			baseWeight: 1,
			rateLimits: [],
		});

		await adapter.execute({ url: "https://api.bilibili.com/x", requestType: "bilibili-api" });
		expect(usedProxy).toBe("http://127.0.0.1:8080");
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

	test("retries a risk-control answer on another adapter", async () => {
		const adapters = new Map<string, NetworkAdapter>([
			[
				"direct-a",
				new FakeAdapter("direct-a", [response("direct-a", "APPLICATION_RATE_LIMIT")]),
			],
			["direct-b", new FakeAdapter("direct-b", [response("direct-b")])],
		]);
		const scheduler = new NetworkScheduler(config(), adapters, new FakeRateLimiter(), {
			random: () => 0,
		});

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x/web-interface/view",
			requestType: "bilibili-api",
		});

		expect(result.adapterId).toBe("direct-b");
		expect(result.errorCode).toBeUndefined();
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
		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "healthy",
			healthFactor: 1,
		});
	});

	test("answers 429 when the adapter's own budget refuses the request", async () => {
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

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});

		// The budget turned the request away before it reached the adapter, so the
		// caller gets a retryable answer rather than a "no adapter" error.
		expect(result.status).toBe(429);
		expect(result.errorCode).toBe("RATE_LIMITED");
		expect(result.adapterId).toBe("");
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
				bindings: [{ requestType: "bilibili-api", adapterIds: ["direct-a"] }],
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

	test("rejects a request type without an explicit binding", async () => {
		const adapter = new FakeAdapter("direct-a", [response("direct-a")]);
		const scheduler = new NetworkScheduler(
			config(),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		await expect(
			scheduler.execute({
				url: "https://api.bilibili.com/x",
				requestType: "unknown-type",
			})
		).rejects.toThrow("No adapter binding for request type: unknown-type");
	});

	test("routes across all enabled adapters when no request type is given", async () => {
		const adapter = new FakeAdapter("direct-a", [response("direct-a")]);
		const scheduler = new NetworkScheduler(
			config({ bindings: undefined }),
			new Map([[adapter.id, adapter]]),
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		expect(await scheduler.execute({ url: "https://api.bilibili.com/x" })).toMatchObject({
			adapterId: "direct-a",
		});
	});

	test("reduces adapter weight after failures but keeps it available", async () => {
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

		const status = scheduler.getAdapterStatuses()[0];
		expect(status).toMatchObject({
			healthState: "degraded",
			consecutiveFailures: 2,
			openUntil: null,
		});
		expect(status?.healthFactor).toBeLessThan(1);
		expect(status?.effectiveWeight).toBeGreaterThan(0);

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
					response("direct-a"),
					response("direct-a"),
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
				health: { ...health(), failureThreshold: 10 },
			}),
			adapters,
			new FakeRateLimiter(),
			{ random: () => 0 }
		);

		await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(scheduler.getAdapterStatuses()[0]?.healthState).toBe("degraded");

		for (let index = 0; index < 4; index++) {
			await scheduler.execute({
				url: "https://api.bilibili.com/x",
				requestType: "bilibili-api",
			});
		}

		expect(scheduler.getAdapterStatuses()[0]).toMatchObject({
			healthState: "healthy",
			healthFactor: 1,
		});
	});

	test("soft reserve uses a computable pool and rejects exhausted traffic", async () => {
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
				requestTypePolicies: { "bilibili-api": { reservedShare: 0.3 } },
			}),
			new Map([["direct-a", new FakeAdapter("direct-a", [response("direct-a")])]]),
			new FakeRateLimiter(["soft-reserve:reserved:bilibili-api", "soft-reserve:shared"]),
			{ random: () => 0 }
		);

		const result = await scheduler.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(result.errorCode).toBe("RATE_LIMITED");
		expect(result.status).toBe(429);
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

	test("propagates an unsupported proxy protocol through the replacement request", () => {
		const result = ReplaceNetworkRuntimeConfigRequestSchema.safeParse({
			revision: 0,
			config: config({
				adapters: [
					{
						id: "proxy-a",
						type: "http-proxy",
						proxyUrl: "socks5://127.0.0.1:1080",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-a"] }],
			}),
		});
		expect(result.success).toBe(false);
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

	test("reports a conflict when the initial write uses a non-zero revision", async () => {
		const service = new NetworkRuntimeConfigService(new FakeConfigRepository());
		await expect(service.replace(7, config())).rejects.toThrow("revision conflicts");
	});

	test("rejects an unsupported proxy protocol before persisting", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);

		await expect(
			service.replace(0, {
				...config(),
				adapters: [
					{
						id: "proxy-a",
						type: "http-proxy",
						proxyUrl: "socks5://bob:hunter2@127.0.0.1:1080",
					},
				],
			})
		).rejects.toThrow();
		expect(await repository.get()).toBeNull();
	});
});

describe("NetworkRuntimeConfigService credential round trip", () => {
	function proxyConfig(proxyUrl: string): NetworkRuntimeConfig {
		return config({
			adapters: [
				{
					id: "proxy-a",
					type: "http-proxy",
					proxyUrl,
					enabled: true,
					baseWeight: 1,
					rateLimits: [],
				},
			],
			bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-a"] }],
		});
	}

	async function storedProxyUrl(repository: FakeConfigRepository): Promise<unknown> {
		const record = await repository.get();
		const parsed = NetworkRuntimeConfigSchema.parse(record?.config);
		const adapter = parsed.adapters[0];
		return adapter?.type === "http-proxy" ? adapter.proxyUrl : undefined;
	}

	test("restores the stored credential when the client writes back the redacted value", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);
		await service.replace(0, proxyConfig("http://bob:hunter2@proxy.example.com:8080"));

		const read = await service.get();
		if (!read) throw new Error("expected a stored configuration");
		const redacted = redactNetworkRuntimeConfigDocument(read);

		await service.replace(1, redacted.config);

		expect(await storedProxyUrl(repository)).toBe("http://bob:hunter2@proxy.example.com:8080");
	});

	test("keeps the submitted host when the credential is restored", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);
		await service.replace(0, proxyConfig("http://bob:hunter2@proxy.example.com:8080"));

		const read = await service.get();
		if (!read) throw new Error("expected a stored configuration");
		const redacted = redactNetworkRuntimeConfigDocument(read);
		const nextConfig = NetworkRuntimeConfigSchema.parse(redacted.config);
		const adapter = nextConfig.adapters[0];
		if (adapter?.type !== "http-proxy") throw new Error("expected an http-proxy adapter");

		await service.replace(1, {
			...nextConfig,
			adapters: [
				{ ...adapter, proxyUrl: redactProxyUrl("http://bob:hunter2@new.example.com:9090") },
			],
		});

		expect(await storedProxyUrl(repository)).toBe("http://bob:hunter2@new.example.com:9090");
	});

	test("rejects a redacted credential when nothing is stored to restore", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);

		await expect(
			service.replace(0, proxyConfig("http://***:***@proxy.example.com:8080"))
		).rejects.toThrow("no stored credential is available to restore");
		expect(await repository.get()).toBeNull();
	});

	test("rejects a redacted credential for an adapter the stored config does not know", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);
		await service.replace(0, proxyConfig("http://bob:hunter2@proxy.example.com:8080"));

		await expect(
			service.replace(1, {
				...proxyConfig("http://***:***@proxy.example.com:8080"),
				adapters: [
					{
						id: "proxy-b",
						type: "http-proxy",
						proxyUrl: "http://***:***@proxy.example.com:8080",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
				],
				bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-b"] }],
			})
		).rejects.toThrow('Adapter "proxy-b"');
	});

	test("accepts a full credential even when the adapter already exists", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);
		await service.replace(0, proxyConfig("http://bob:hunter2@proxy.example.com:8080"));

		await service.replace(1, proxyConfig("http://alice:rotated@proxy.example.com:8080"));

		expect(await storedProxyUrl(repository)).toBe(
			"http://alice:rotated@proxy.example.com:8080"
		);
	});

	test("still writes when the stored document can no longer be parsed", async () => {
		const repository = new FakeConfigRepository();
		const service = new NetworkRuntimeConfigService(repository);
		await service.replace(0, proxyConfig("http://bob:hunter2@proxy.example.com:8080"));
		repository.setRawConfig({ broken: true });

		await service.replace(2, proxyConfig("http://alice:rotated@proxy.example.com:8080"));

		expect(await storedProxyUrl(repository)).toBe(
			"http://alice:rotated@proxy.example.com:8080"
		);
	});
});

describe("NetworkRuntimeConfigManager", () => {
	test("reports an empty runtime status before the first load", () => {
		const manager = createManager(new FakeConfigRepository());

		expect(manager.getStatus()).toEqual({ ready: false, revision: null, adapters: [] });
		expect(NetworkRuntimeStatusSchema.safeParse(manager.getStatus()).success).toBe(true);
	});

	test("reports per-adapter runtime status once a configuration is applied", async () => {
		const repository = new FakeConfigRepository();
		await repository.create(config());
		const manager = createManager(repository);

		expect(await manager.load()).toBe(true);

		const status = manager.getStatus();
		expect(status.ready).toBe(true);
		expect(status.revision).toBe(1);
		expect(status.adapters.map((adapter) => adapter.id)).toEqual(["direct-a", "direct-b"]);
		expect(status.adapters[0]).toMatchObject({
			enabled: true,
			healthState: "healthy",
			healthFactor: 1,
			effectiveWeight: 1,
			consecutiveFailures: 0,
			openUntil: null,
		});
		expect(NetworkRuntimeStatusSchema.safeParse(status).success).toBe(true);
		// The status payload must never expose the proxy URL or its credentials.
		expect(JSON.stringify(status)).not.toContain("proxyUrl");
	});

	test("does not replace a newer runtime with an older revision", async () => {
		const repository = new FakeConfigRepository();
		const manager = createManager(repository);
		const service = new NetworkRuntimeConfigService(repository);
		const older = await service.replace(0, config());
		const newer = await service.replace(1, config());
		expect(manager.apply(newer)).toBe(true);
		expect(manager.apply(older)).toBe(false);
		expect(manager.getStatus()).toMatchObject({ ready: true, revision: 2 });
	});

	test("keeps the last valid scheduler when a later document is invalid", async () => {
		const repository = new FakeConfigRepository();
		await repository.create(config());
		const transport: NetworkTransport = {
			async execute(): Promise<NetworkResponse> {
				return response("");
			},
		};
		const manager = createManager(repository, transport);
		expect(await manager.load()).toBe(true);
		repository.setRawConfig({ invalid: true });
		expect(await manager.load()).toBe(false);
		const result = await manager.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(["direct-a", "direct-b"]).toContain(result.adapterId);
	});

	test("keeps the last valid scheduler when the new proxy protocol is unsupported", async () => {
		const repository = new FakeConfigRepository();
		await repository.create(config());
		const transport: NetworkTransport = {
			async execute(): Promise<NetworkResponse> {
				return response("");
			},
		};
		const manager = createManager(repository, transport);
		expect(await manager.load()).toBe(true);

		const invalidConfig: NetworkRuntimeConfig = {
			...config(),
			adapters: [
				{
					id: "proxy-a",
					type: "http-proxy",
					proxyUrl: "socks5://bob:hunter2@127.0.0.1:1080",
					enabled: true,
					baseWeight: 1,
					rateLimits: [],
				},
			],
			bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-a"] }],
		};
		expect(NetworkRuntimeConfigSchema.safeParse(invalidConfig).success).toBe(false);
		repository.setRawConfig(invalidConfig);

		expect(await manager.load()).toBe(false);
		expect(manager.getStatus()).toMatchObject({ ready: true, revision: 1 });

		const result = await manager.execute({
			url: "https://api.bilibili.com/x",
			requestType: "bilibili-api",
		});
		expect(["direct-a", "direct-b"]).toContain(result.adapterId);
	});

	test("does not expose proxy credentials in the rejection reason", () => {
		const result = NetworkRuntimeConfigSchema.safeParse({
			adapters: [
				{
					id: "proxy-a",
					type: "http-proxy",
					proxyUrl: "socks5://bob:hunter2@127.0.0.1:1080",
					enabled: true,
					baseWeight: 1,
					rateLimits: [],
				},
			],
			bindings: [{ requestType: "bilibili-api", adapterIds: ["proxy-a"] }],
			requestTypePolicies: {},
		});

		expect(result.success).toBe(false);
		expect(result.error?.message ?? "").not.toContain("hunter2");
	});

	test("forwards the injectable clock to the scheduler", async () => {
		const repository = new FakeConfigRepository();
		await repository.create(
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
				health: { ...health(), cooldownMs: 1_000 },
			})
		);
		let now = 0;
		const transport: NetworkTransport = {
			async execute(): Promise<NetworkResponse> {
				return response("", "NETWORK_FAILURE");
			},
		};
		const manager = new NetworkRuntimeConfigManager(
			repository,
			new AdapterRegistry(transport),
			new FakeRateLimiter(),
			{ clock: () => now }
		);
		expect(await manager.load()).toBe(true);

		for (let index = 0; index < 3; index++) {
			await manager.execute({
				url: "https://api.bilibili.com/x",
				requestType: "bilibili-api",
			});
		}
		expect(manager.getStatus().adapters[0]).toMatchObject({
			healthState: "open",
			openUntil: 1_000,
			effectiveWeight: 0,
		});

		now = 1_001;
		expect(manager.getStatus().adapters[0]?.healthState).toBe("half-open");
	});
});
