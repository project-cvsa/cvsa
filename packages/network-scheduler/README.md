# @cvsa/network-scheduler

`@cvsa/network-scheduler` is a small, runtime-configurable request scheduler for applications that need to spread traffic across direct and proxied network paths.

It combines:

- request-type routing;
- weighted adapter selection;
- health-aware failover;
- per-adapter and shared token-bucket rate limits backed by Redis;
- pluggable transports, logging, metrics, and tracing;
- Zod schemas for validating configuration documents.

## Installation

```bash
bun add @cvsa/network-scheduler
```

The package uses `node-fetch` and `proxy-agent` for its default transport. `proxy-agent` supports HTTP, HTTPS, and SOCKS proxy URLs. Redis is only required when using `RedisRateLimiter`.

## Quick start

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
			id: "backup-proxy",
			type: "http-proxy",
			proxyUrl: "http://proxy.example.com:8080",
			enabled: true,
			baseWeight: 0.5,
			rateLimits: [],
		},
	],
	bindings: [
		{
			requestType: "bilibili-api",
			adapterIds: ["direct", "backup-proxy"],
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

const response = await scheduler.execute({
	url: "https://api.bilibili.com/x/web-interface/view?bvid=...",
	requestType: "bilibili-api",
	timeoutMs: 10_000,
});

console.log(response.status, response.body);
await rateLimiter.close?.();
```

`NetworkScheduler` returns the response body as text. It does not interpret application-specific payloads.

## Adapters and routing

An adapter has an identifier, a type, an optional weight, an enabled flag, and zero or more rate limits. A binding maps a `requestType` to the adapters that may handle it.

Supported adapter types:

| Type | Example | Use |
| --- | --- | --- |
| `direct` | — | Connect directly to the target. |
| `http-proxy` | `http://proxy.example.com:8080` | Route through an HTTP or HTTPS proxy. |
| `socks-proxy` | `socks5://proxy.example.com:1080` | Route through a SOCKS proxy. |

The default transport uses a cached `ProxyAgent` per proxy URL, so proxy adapters perform actual proxy connections instead of merely passing a non-standard option to `fetch`. Proxy credentials may be embedded in the URL using standard URL encoding.

## Scheduling behavior

For each request, the scheduler:

1. resolves the request type to its binding;
2. applies the shared soft-reserve limit;
3. selects enabled adapters using `baseWeight * healthFactor`;
4. applies the selected adapter's rate limits;
5. retries the request on another candidate after a transient failure.

The following failures trigger failover within the same call:

- `NETWORK_FAILURE`
- `REQUEST_TIMEOUT`
- `HTTP_429`
- `HTTP_5XX`

Business-level Bilibili errors and other 4xx responses are returned to the caller and do not reduce adapter health.

When no route or usable adapter exists, the scheduler throws `NetworkSchedulerError` with code `NO_AVAILABLE_ADAPTER` and status code `503`. A rejected soft-reserve check is returned as a `429` response with error code `RATE_LIMITED`.

## Rate limiting

`RedisRateLimiter` uses a Redis-backed token bucket. Create one with a Redis connection URL and close it during application shutdown:

```ts
import { createRedisRateLimiter } from "@cvsa/network-scheduler";

const limiter = createRedisRateLimiter("redis://localhost:6379");
// pass limiter to NetworkScheduler
await limiter.close();
```

For tests or single-process integrations, implement `NetworkRateLimiter` yourself or use the exported `FakeRateLimiter`.

## Custom transport and observability

The default transport is replaceable when an application needs a different HTTP client, custom TLS behavior, or a platform-specific proxy implementation:

```ts
import type { NetworkTransport } from "@cvsa/network-scheduler";

const transport: NetworkTransport = {
	async execute(request, proxyUrl) {
		return myHttpClient.request(request, { proxyUrl });
	},
};

const registry = new AdapterRegistry(transport);
```

`NetworkSchedulerOptions` accepts custom `logger`, `metrics`, `tracer`, and a deterministic `random` function for tests. No-op implementations are used when these options are omitted.

## Configuration validation

Use `NetworkRuntimeConfigSchema.parse()` or `.safeParse()` before creating a scheduler. Validation covers:

- adapter identifiers and proxy URL schemes;
- duplicate adapter IDs and request bindings;
- bindings that reference unknown adapters;
- positive rate-limit values;
- health-factor ranges;
- a total reserved share no greater than `1`.

The package also exports schemas for persisted configuration documents and replacement requests.
