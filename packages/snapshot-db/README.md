# @cvsa/snapshot-db

The crawler's independent TimescaleDB access package. It owns its Prisma schema,
migrations, generated client, and connection lifecycle. It must not import or
reuse `@cvsa/db`.

Run `bun run migrate:deploy` with `CRAWLER_SNAPSHOT_DATABASE_URL` set to apply
the hypertable migration. Set `SNAPSHOT_DB_TESTS=1` to run the integration test
against the migrated database.
