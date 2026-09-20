# Crawler

The crawler is an independent Bun daemon. Its entrypoint only assembles the
runtime, starts it, and handles `SIGINT`/`SIGTERM`; crawler business modules
belong in `@cvsa/core`.

Required runtime settings live in the crawler env config: `REDIS_URL`,
`SNAPSHOT_DATABASE_URL`, `CONTROL_API_TOKEN`, and the control-plane host/port.
They use the same unprefixed names as the rest of the repo (see `.env.example`);
the crawler does not import `@cvsa/db` or read `DATABASE_URL`. The snapshot
database defaults to `cvsa_snapshot`, or `cvsa_snapshot_test` while
`NODE_ENV=test`, so the tests never reset local development data — see
`packages/snapshot-db/README.md`.

## Control plane

`crawlerControlPlane` in `src/controlPlane.ts` is a module-level Elysia app wired
to the process singletons in `src/container.ts`, the same way the backend
handlers are wired. `tests/controlPlane.test.ts` covers it end to end against the
real snapshot database and Redis, with the token supplied by
`apps/crawler/.env.test` (copy `.env.example`).

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/v2/network-runtime/config` | Returns the persisted document with proxy credentials masked |
| `PUT` | `/v2/network-runtime/config` | Writes a full configuration at an expected `revision`, then hot-applies it |
| `GET` | `/v2/network-runtime/status` | Returns readiness, revision, and per-adapter health |

Every route requires `Authorization: Bearer $CONTROL_API_TOKEN`. When the token
is unset the process refuses to start and every route answers `401`.

`PUT` rejects a stale `revision` with `409`. The request body must carry a valid
configuration: an unsupported proxy protocol or an unparsable document is
rejected with `422` and the last valid runtime configuration stays in effect.

### Credential handling

`GET` and `PUT` never return a plaintext proxy credential — the userinfo segment
of `proxyUrl` is replaced with `***` (for example
`http://***:***@proxy.example.com:8080`). The stored document still owns the real
credential, and `PUT` accepts a full credential as before.

A read-modify-write cycle is safe: when a submitted `proxyUrl` carries the `***`
placeholder, the write path re-inserts the credential stored for the same adapter
id, keeping the submitted host, port, and path. Rotating an exit therefore works.
A placeholder with no stored credential to restore (a new adapter, or the first
write) is rejected with `422` instead of being persisted literally.

The placeholder match is exact (`***` or `***:***`), so a credential that merely
contains asterisks is still treated as a real credential. Use any password other
than a literal `***`.

Storing credentials in plaintext in the database remains, as does a credential
reference or secret store; that is a follow-up product decision.

### Logging and metrics

`appLogger` scrubs credentials before a record reaches any sink: values under
credential-shaped keys (`password`, `token`, `authorization`, `cookie`,
`proxyUrl`, …) are replaced at any depth, and `scheme://user:pass@host` inside a
message is masked. pino's own `redact` paths (`LOG_REDACT_PATHS`) cover direct
`pinoLogger` callers as a second layer.
