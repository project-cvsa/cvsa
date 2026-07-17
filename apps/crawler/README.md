# Crawler

The crawler is an independent Bun daemon. Its entrypoint only assembles the
runtime, starts it, and handles `SIGINT`/`SIGTERM`; crawler business modules
belong in `@cvsa/core`.

Required runtime settings are namespaced with `CRAWLER_`, especially
`CRAWLER_REDIS_URL` and `CRAWLER_SNAPSHOT_DATABASE_URL`. The crawler does not
import `@cvsa/db` or read `DATABASE_URL`.
