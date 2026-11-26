# Crawler Instructions (`apps/crawler`)

Owns Bilibili video discovery, snapshot tracking, ONNX `akari` classification (`src/ml/`), network adapter integration (`@cvsa/network-scheduler`), and the authenticated Elysia control plane (`src/controlPlane/` mounted on `/v2`).

Read [Crawler & Curation](../../apps/docs/content/engineering/specs/crawler-and-curation.md), [Bilibili API](../../apps/docs/content/references/bilibili-api.md), and [TimescaleDB & Drizzle](../../apps/docs/content/references/timescaledb-and-drizzle.md).

## Boundaries & Invariants

- **Database isolation**: Persist tracking, snapshots, discovery samples, and metadata strictly through `@cvsa/snapshot-db`. Do not import `@cvsa/db` or couple crawler execution directly to `apps/backend`.
- **Control plane security**: `src/index.ts` requires `CONTROL_API_TOKEN` in production (`crawlerEnv` provides defaults only in `development` and `test`); keep `/v2` control-plane routes guarded by bearer verification.
- **Types & scheduling**: Use `bigint` AIDs and `Temporal.Instant` (from `@cvsa/snapshot-db`) for all scheduling and lease calculations; keep repository leases (`claimDueVideos`) and snapshot writes idempotent.
- **Bundles & native externals**: `build` compiles `dist/index.js`, `dist/akariWorker.js`, and bundled `@cvsa/snapshot-db` migration/Timescale scripts (`dist/migrate.js`, `dist/ensure-timescale.js`, `dist/drizzle/`) while keeping `onnxruntime-node`, `sharp`, and `header-generator` external.
- **Testing**: Unit tests in `tests/` run offline with in-memory fakes (`InMemoryDiscoveryRepository`, `InMemoryTrackingRepository`); `*.db.test.ts` files require `cvsa_snapshot_test` provisioned by `@cvsa/snapshot-db#test:setup`.

## Verification

```bash
bun run --cwd apps/crawler lint
bun run --cwd apps/crawler typecheck
bun run --cwd apps/crawler test
bun run --cwd apps/crawler build
```
