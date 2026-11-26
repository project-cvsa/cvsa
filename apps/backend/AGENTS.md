# Backend Instructions (`apps/backend`)

Owns the Elysia HTTP API (`src/handlers/`), request middlewares (`src/middlewares/`), search indexing/outbox workers (`src/search/`, `src/outbox/`), and the type-only Eden contract (`src/apiContract.ts`). Domain logic and persistence live in `@cvsa/catalog`, `@cvsa/authentication`, and `@cvsa/db`.

Read [Architecture](../../apps/docs/content/engineering/architecture.md), [API & Contracts](../../apps/docs/content/engineering/specs/api-and-contracts.md), and [Testing](../../apps/docs/content/engineering/practices/testing.md).

## Boundaries & Invariants

- **Routing**: Mount all endpoints under `/v2` on the root router (`src/index.ts`). Handlers declare relative noun paths without `/v2` or verbs (for example, `/song/:id/details`).
- **Layering & validation**: Validate inputs with Zod schemas imported from `@cvsa/contracts` (never define inline handler Zod schemas or use Elysia TypeBox `t`). Delegate immediately to domain Services and let `AppError` bubble to `src/errorHandler.ts` without `try-catch` in handlers.
- **CORS & trace ID**: Keep `allowedHeaders` and `exposedHeaders` (`x-trace-id`) aligned across `zh.`, `en.`, `api.projectcvsa.com`, `WEB_ORIGINS`, and `SITE_ADDRESS`.
- **Type-only client bridge**: Keep `src/apiContract.ts` free of runtime leaks to browser bundles; `apps/web` imports it exclusively via `import type`.
- **Testing**: Write E2E tests in `tests/` using Elysia Eden Treaty through public HTTP contracts against test backing services (`db`, `redis`, `meili`) rather than mocking internals.

## Verification

```bash
bun run --cwd apps/backend lint
bun run --cwd apps/backend typecheck
bun run --cwd apps/backend test
bun run --cwd apps/backend build
```
