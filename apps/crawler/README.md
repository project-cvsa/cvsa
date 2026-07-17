# Crawler

The crawler is an independent Bun daemon. Its entrypoint only assembles the
runtime, starts it, and handles `SIGINT`/`SIGTERM`; crawler business modules
belong in `@cvsa/core`.

Required runtime settings are namespaced from the crawler env config, especially
`REDIS_URL` and `SNAPSHOT_DATABASE_URL`. The crawler does not import `@cvsa/db`
or read `DATABASE_URL`.
