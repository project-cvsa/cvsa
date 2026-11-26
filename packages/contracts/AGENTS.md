# Contracts Instructions (`packages/contracts`)

Owns shared Zod schemas, inferred DTO types (`z.infer<typeof Schema>`), `AppError`, and `ErrorCodeEnum` shared across `apps/backend`, `apps/crawler`, `apps/deploy`, `apps/embedding`, `apps/web`, and domain packages.

Read [API & Contracts](../../apps/docs/content/engineering/specs/api-and-contracts.md).

## Boundaries & Invariants

- **Browser-safe runtime**: Keep this package purely schema and error definitions (`zod` only). Never import database clients, Elysia, logger, or server-only modules—`apps/web` bundles `@cvsa/contracts` directly into client code.
- **Strict schema typing**: Never use `z.any()`, `any`, or `as SomeType`. Export inferred types via `z.infer<typeof ...>` rather than duplicating interfaces.
- **Package exports**: Keep `package.json` `exports` aligned with subpath modules (`./errors`, `./song`, `./crawler`, `./crawler/policies`, `./crawler/operations`) and re-export from `src/index.ts`.
- **Cross-app impact**: Changing a schema or `ErrorCodeEnum` affects both backend handlers and frontend/crawler consumers; run root `bun run typecheck` after modifying contracts.

## Verification

```bash
bun run --cwd packages/contracts lint
bun run --cwd packages/contracts typecheck
bun run --cwd packages/contracts test
```
