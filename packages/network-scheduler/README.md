# @cvsa/network-scheduler

Route requests across direct connections and proxy endpoints with weighted selection, rate limits, failover, and runtime configuration reloads.

## Install

```bash
bun add @cvsa/network-scheduler
```

Use a Redis instance when enabling the built-in rate limiter.

## Create a scheduler

Define adapters and bind them to request types. Validate the configuration before passing it to the scheduler.

```ts
import {
	AdapterRegistry,
	NetworkRuntimeConfigSchema,
	NetworkScheduler,
	createRedisRateLimiter,
} from "@cvsa/network-scheduler";

const config = NetworkRuntimeConfigSchema.parse({
	adapters: [
		{
			id: "direct",
			type: "direct",
			enabled: true,
			baseWeight: 1,
			rateLimits: [{ durationSeconds: 60, maxRequests: 600 }],
		},
		{
			id: "proxy",
			type: "http-proxy",
			proxyUrl: "http://proxy.example.com:8080",
			enabled: true,
			baseWeight: 0.5,
			rateLimits: [],
		},
	],
	bindings: [
		{
			requestType: "catalog-api",
			adapterIds: ["direct", "proxy"],
		},
	],
	requestTypePolicies: {},
});

const registry = new AdapterRegistry();
const adapters = new Map(
	config.adapters.map((adapterConfig) => [
		adapterConfig.id,
		registry.create(adapterConfig),
	])
);

const rateLimiter = createRedisRateLimiter(
	process.env.REDIS_URL ?? "redis://localhost:6379"
);
const scheduler = new NetworkScheduler(config, adapters, rateLimiter);
```

## Configure adapters

Choose one of the following adapter types:

| Type | `proxyUrl` | Example |
| --- | --- | --- |
| `direct` | Omit it | — |
| `http-proxy` | HTTP or HTTPS URL | `http://proxy.example.com:8080` |
| `socks-proxy` | `socks://` or `socks5://` URL | `socks5://proxy.example.com:1080` |

Use `baseWeight` to control selection probability. Set `enabled` to `false` to take an adapter out of service without removing its configuration.

Add one or more limits to `rateLimits`:

```ts
rateLimits: [
	{ durationSeconds: 1, maxRequests: 10 },
	{ durationSeconds: 60, maxRequests: 300 },
],
```

An adapter must be referenced by at least one binding to receive requests:

```ts
bindings: [
	{ requestType: "catalog-api", adapterIds: ["direct", "proxy"] },
	{ requestType: "metadata", adapterIds: ["direct"] },
],
```

## Send requests

Pass a `requestType` that exists in `bindings`:

```ts
const response = await scheduler.execute({
	url: "https://api.example.com/catalog/items/123",
	requestType: "catalog-api",
	method: "GET",
	headers: { Accept: "application/json" },
	timeoutMs: 10_000,
});

if (response.errorCode) {
	console.error(response.errorCode, response.status);
} else {
	const body = JSON.parse(response.body);
	console.log(body);
}
```

Handle `NetworkSchedulerError` when no route or usable adapter is available:

```ts
import { NetworkSchedulerError } from "@cvsa/network-scheduler";

try {
	await scheduler.execute(request);
} catch (error) {
	if (error instanceof NetworkSchedulerError) {
		console.error(error.code, error.statusCode, error.message);
	}
}
```

Treat these response errors as retryable when handling the result:

- `NETWORK_FAILURE`
- `REQUEST_TIMEOUT`
- `HTTP_429`
- `HTTP_5XX`

## Reload configuration

Keep the scheduler instance and call `reload()` with the new configuration and adapter map:

```ts
const nextConfig = NetworkRuntimeConfigSchema.parse(nextDocument.config);
const nextAdapters = new Map(
	nextConfig.adapters.map((adapterConfig) => [
		adapterConfig.id,
		registry.create(adapterConfig),
	])
);

scheduler.reload(nextConfig, nextAdapters);
```

Build and validate the complete configuration before calling `reload()`. Do not mutate a configuration or adapter map after passing it to the scheduler.

## Reserve capacity by request type

Use `requestTypePolicies` to reserve a share of the available request capacity:

```ts
requestTypePolicies: {
	priority: { reservedShare: 0.25 },
	background: { reservedShare: 0.1 },
},
```

Keep the sum of all `reservedShare` values at or below `1`.

## Use Redis rate limiting

Create one limiter and share it across scheduler reloads:

```ts
const limiter = createRedisRateLimiter("redis://localhost:6379");
const scheduler = new NetworkScheduler(config, adapters, limiter);

// Reuse `limiter` when calling scheduler.reload().

await limiter.close();
```

For tests or single-process use, implement `NetworkRateLimiter` or use the exported `FakeRateLimiter`.

## Customize the transport

Provide a `NetworkTransport` when you need a different HTTP client, TLS configuration, or proxy implementation:

```ts
import type { NetworkTransport } from "@cvsa/network-scheduler";

const transport: NetworkTransport = {
	async execute(request, proxyUrl) {
		return myHttpClient.request(request, { proxyUrl });
	},
};

const registry = new AdapterRegistry(transport);
```

Pass `logger`, `metrics`, `tracer`, or a deterministic `random` function through `NetworkSchedulerOptions` when needed.

## Validate configuration

Use `NetworkRuntimeConfigSchema.parse()` to reject invalid configuration or `.safeParse()` to handle validation errors yourself. The package also exports schemas for persisted configuration documents and replacement requests.

## Close resources

Close the shared rate limiter during application shutdown:

```ts
await rateLimiter.close?.();
```

## Development

```bash
bun install
bun run --cwd packages/network-scheduler typecheck
bun run --cwd packages/network-scheduler lint
bun run --cwd packages/network-scheduler test
bun run --cwd packages/network-scheduler build
```
