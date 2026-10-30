# @cvsa/backend

The core REST API service for CVSA, built with [Elysia](https://elysiajs.com) and Prisma. It serves public archive endpoints under `/v2`, manages authentication, syncs search indexes with Meilisearch, and bridges the crawler control plane.

## Development

```bash
# Start backend API server in watch mode (http://localhost:16412)
bun dev

# Run end-to-end API tests against test databases
bun test
```

## Environment

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection for caching and outbox queues |
| `MEILI_API_URL` | Meilisearch host URL (default `http://localhost:7700`) |
| `MEILI_MASTER_KEY` | Master key for Meilisearch operations |
| `BETTER_AUTH_SECRET` | Secret key for session encryption |
| `CONTROL_API_URL` | Endpoint to reach the crawler control plane |
| `CONTROL_API_TOKEN` | Bearer token for authenticating with the crawler control plane |
