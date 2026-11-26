# Snapshot Database Instructions (`packages/snapshot-db`)

Owns the crawler's independent TimescaleDB Drizzle schema (`src/schema/` in `public`), Bun SQL client (`src/client.ts`), versioned SQL migrations (`drizzle/`), and idempotent TimescaleDB setup (`scripts/ensure-timescale.ts`, `scripts/extensions.ts`). Must never import or reuse `@cvsa/db`.

Read [TimescaleDB & Drizzle](../../apps/docs/content/references/timescaledb-and-drizzle.md).

## Boundaries & Invariants

- **Bun SQL lifecycle & `bigint`**: `createDatabaseClient` sets `bigint: true` at `new SQL(...)` construction and bounds `idleTimeout`/`maxLifetime` so TimescaleDB sessions release chunk metadata caches; `scripts/ensure-timescale.ts` uses `idleTimeout: 0` for long DDL.
- **TimescaleDB DDL boundary**: `drizzle.config.ts` sets `schemaFilter: ["public"]` so `push` never touches `_timescaledb_*` schemas. Hypertable creation (`video_snapshot`, 30-day chunks, 7-day compression), `extensions` schema isolation, and the `latest_video_snapshot` trigger live in `scripts/ensure-timescale.ts` and `drizzle/0001_timescale.sql`; keep `ensure-timescale.ts` idempotent.
- **Environment**: `SNAPSHOT_DATABASE_URL` resolves via `@cvsa/env` (`cvsa_snapshot_test` on port `5433` under `NODE_ENV=test`, `cvsa_snapshot` otherwise). Do not alter schemas or migrations unless explicitly instructed.

## Verification

```bash
bun run --cwd packages/snapshot-db lint
bun run --cwd packages/snapshot-db typecheck
bun run --cwd packages/snapshot-db test:setup && bun run --cwd packages/snapshot-db test
```
