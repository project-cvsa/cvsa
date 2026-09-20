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

Routing is strict about declared request types:

- When `requestType` is provided, it must match a `bindings` entry. An unknown
  request type raises `NetworkSchedulerError` instead of silently using every
  configured adapter.
- When `requestType` is omitted, the scheduler keeps the backwards-compatible
  default routing across every enabled adapter. Omit it only for traffic that is
  genuinely adapter-agnostic.

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

`execute()` answers rather than throws when a budget turned the request away: it
returns status `429` with `errorCode: "RATE_LIMITED"` and an empty `adapterId`,
because no adapter carried the request. `NO_AVAILABLE_ADAPTER` (503) is thrown
only when no adapter could be attempted at all — no binding for the request
type, no enabled adapter, or every candidate's circuit is open. A retryable
answer from an adapter that actually ran is always returned as-is, in preference
to the synthetic `429`.

Treat these response errors as retryable when handling the result — they are also
the codes that affect adapter health:

- `NETWORK_FAILURE`
- `REQUEST_TIMEOUT`
- `HTTP_429`
- `HTTP_5XX`
- `APPLICATION_RATE_LIMIT`

`APPLICATION_ERROR` and `HTTP_4XX` describe the requested resource, not the exit,
so they never trigger failover and never degrade adapter health. The exported
`RETRYABLE_NETWORK_ERROR_CODES` and `HEALTH_AFFECTING_NETWORK_ERROR_CODES` sets
are the single source of truth for that split.

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

Reload preserves runtime health for adapters that keep their id, drops it for
adapters that were removed, and starts new adapters as healthy. Requests already
in flight keep using the state snapshot they started with.

## Adapter health

Each adapter moves between four observable states:

| State | Meaning | Selected? |
| --- | --- | --- |
| `healthy` | No recent health-affecting failure | Yes |
| `degraded` | Recent failures reduced its weight | Yes, with lower weight |
| `open` | Isolated until the cooldown elapses | No |
| `half-open` | Cooldown elapsed; one probe is allowed | Yes, one probe slot |

Consecutive health-affecting failures multiply the weight by `failurePenalty`.
Once they reach `failureThreshold`, the adapter is isolated for `cooldownMs`.
After the cooldown, a single probe request is admitted; success restores the
adapter to `healthy` with full weight, failure reopens the circuit, and a business
error closes the circuit at its degraded weight.

```ts
health: {
	failurePenalty: 0.5,
	recoveryBonus: 0.2,
	minWeightFactor: 0.05,
	failureThreshold: 3,
	cooldownMs: 30_000,
},
```

Time is read from `NetworkSchedulerOptions.clock`, so tests can advance cooldowns
without waiting. Inspect `scheduler.getAdapterStatuses()` for the current state,
health factor, effective weight, consecutive failures, and cooldown deadline.

## Reserve capacity by request type

Use `requestTypePolicies` to reserve a share of the available request capacity:

```ts
requestTypePolicies: {
	priority: { reservedShare: 0.25 },
	background: { reservedShare: 0.1 },
},
```

Keep the sum of all `reservedShare` values at or below `1`.

Soft reserve partitions an already computable pool. The pool rate is the sum of
the per-second rate limits of enabled adapters. When no reserve policy is
configured, or when no adapter declares a rate limit, soft reserve stays disabled
entirely — the scheduler never invents a fallback one-request-per-second budget.
The partitioning is evaluated through the shared `NetworkRateLimiter`, so the
budget is enforced across processes when the Redis limiter is used.

## Use Redis rate limiting

Create one limiter and share it across scheduler reloads:

```ts
const limiter = createRedisRateLimiter("redis://localhost:6379");
const scheduler = new NetworkScheduler(config, adapters, limiter);

// Reuse `limiter` when calling scheduler.reload().

await limiter.close();
```

For tests or single-process use, implement `NetworkRateLimiter` or import `FakeRateLimiter` from the `@cvsa/network-scheduler/testing` entry point.

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

Pass `logger`, `metrics`, `tracer`, `clock`, or a deterministic `random` function through `NetworkSchedulerOptions` when needed.

Interpret upstream application payloads through the classifier hook instead of teaching this package about a specific API. The classifier runs for 4xx responses as well as for 2xx responses, but never overrides `HTTP_429` or `HTTP_5XX`:

```ts
const registry = new AdapterRegistry(
	createAxiosNetworkTransport(axios, {
		classifyApplicationError: ({ status, body }) =>
			status === 412 ? "APPLICATION_RATE_LIMIT" : undefined,
	})
);
```

## Validate configuration

Use `NetworkRuntimeConfigSchema.parse()` to reject invalid configuration or `.safeParse()` to handle validation errors yourself. Persisted configuration documents and replacement requests are not this package's concern; the crawler module owns those schemas.

`http-proxy` adapters only accept `http:` and `https:` URLs. Another scheme is rejected at validation time rather than being persisted as a configuration that can never work.

## Close resources

Close the shared rate limiter during application shutdown:

```ts
await rateLimiter.close?.();
```
