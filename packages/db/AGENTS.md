# Primary Database Instructions (`packages/db`)

Owns the primary PostgreSQL Drizzle ORM schema (`src/schema/` across `core`, `meta`, `platform`, `auth`), relations (`src/relations.ts`), `temporalInstant` custom types (`src/customTypes.ts`), Bun SQL client (`src/client.ts`), and versioned SQL migrations (`drizzle/`). Completely independent from `@cvsa/snapshot-db`.

Read [Architecture](../../apps/docs/content/engineering/architecture.md) and [TimescaleDB & Drizzle](../../apps/docs/content/references/timescaledb-and-drizzle.md).

## Boundaries & Invariants

- **Schema boundaries**: Do not alter schemas or `drizzle/` migrations unless explicitly instructed. Declare new PostgreSQL schemas in `src/schema/schemas.ts` and keep `schemaFilter` in `drizzle.config.ts` (`["core", "meta", "platform", "auth"]`) aligned so `push` never drops external schemas.
- **Bun SQL `bigint` flag**: `createDatabaseClient` passes `bigint: true` inside `new SQL(...)` at construction time because Bun ignores Drizzle's post-construction mutation; removing it turns `int8` IDs into strings.
- **Temporal instants**: Use `temporalInstant` / `managedInstant` (`Temporal.Instant` from `temporal-polyfill`) for `timestamptz` columns instead of mixing raw `Date` strings.
- **Environment**: `DATABASE_URL` resolves via `@cvsa/env` (`cvsa_test` under `NODE_ENV=test`, `cvsa` otherwise). Note that `package.json` declares no `test` script; persistence is tested via `apps/backend` and domain packages after `test:setup`.

## Verification

```bash
bun run --cwd packages/db lint
bun run --cwd packages/db typecheck
bun run --cwd packages/db test:setup
```
