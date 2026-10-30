# @cvsa/snapshot-db

The crawler's independent TimescaleDB access package. It owns its Drizzle
schema, migrations, and connection lifecycle. It must not import or reuse
`@cvsa/db`.

## Schema

`src/schema/` is the single source of truth. Every column is declared explicitly
(including its snake_case database name), so the TypeScript model and the DDL
cannot drift. `src/customTypes.ts` maps `timestamptz` to `Temporal.Instant`,
which means rows come back already typed for the scheduler arithmetic instead of
being converted at every call site.

## Migrations and TimescaleDB

SQL migrations live in `drizzle/` and are applied in order by
`bun run migrate:deploy` (`scripts/migrate.ts`). The first migration is
idempotent so a database that was created by an earlier toolchain adopts the
Drizzle history instead of being recreated.

The TimescaleDB pieces — the extension, `create_hypertable`, the compression
policy, and the retention removal — cannot be expressed in the Drizzle schema
document. They live in `drizzle/0001_timescale.sql` and in
`scripts/ensure-timescale.ts`. The script is idempotent and also runs after
`db:update` and `test:setup`, because `drizzle-kit push` creates
`video_snapshot` as a plain table.

## Development and test databases

`bun run db:update` syncs a development database straight from the schema with
`drizzle-kit push`. The docker-compose service hosts two databases on port 5433:
`cvsa_snapshot` for development and `cvsa_snapshot_test` for tests.
`SNAPSHOT_DATABASE_URL` defaults to the one that matches `NODE_ENV`, so
`test:setup` and `test:reset` — which run with `NODE_ENV=test` — provision and
reset the test database and leave local development data alone. Set
`SNAPSHOT_DATABASE_URL` explicitly to override.
