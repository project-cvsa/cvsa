# @cvsa/snapshot-db

The crawler's independent TimescaleDB access package. It owns its Prisma schema,
migrations, generated client, and connection lifecycle. It must not import or
reuse `@cvsa/db`.

Run `bun run migrate:deploy` with `SNAPSHOT_DATABASE_URL` set to apply the
migration and the TimescaleDB setup. `bun run test:setup` does the same for the
docker-compose service and is what turbo runs as part of `setup:ci`; it creates
the database when it does not exist yet. The integration test in `tests/` then
runs as part of `bun run test`.

## Migrations and TimescaleDB

`packages/snapshot-db/prisma/migrations/app/` holds the Prisma 8 migration
graph. Plan changes with `bun run migrate` and apply them with
`bun run migrate:deploy`; never author the SQL by hand.

The TimescaleDB pieces — the extension, `create_hypertable`, the compression
policy, and the retention removal — are not expressible in the contract, so
`migrate:deploy` runs `scripts/ensure-timescale.ts` after `prisma db migrate`.
The script is idempotent and also runs after `db:update` and `test:setup`:
a database bootstrapped with `prisma db update` already carries the contract
marker, which makes `prisma db migrate` skip its migrations entirely.

## Development and test databases

The docker-compose service hosts two databases on port 5433: `cvsa_snapshot` for
development and `cvsa_snapshot_test` for tests. `SNAPSHOT_DATABASE_URL` defaults
to the one that matches `NODE_ENV`, so `test:setup` and `test:reset` — which run
with `NODE_ENV=test` — provision and reset the test database and leave local
development data alone. Set `SNAPSHOT_DATABASE_URL` explicitly to override.
