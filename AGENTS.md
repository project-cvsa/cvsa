# System Prompt & Guide for AI Agents

## 1. System Context
**Project:** CVSA (Chinese Vocal Synthesizer Archive)
**GitHub Repository**: [project-cvsa/cvsa](https://github.com/project-cvsa/cvsa)
**Repository Type:** Monorepo (Turborepo)
**Tech Stack:** Bun, Elysia, Prisma, TimescaleDB, PostgreSQL, Zod, TypeScript, Biome

### Workspace Structure
- `apps/backend`: REST API & outbox service (Elysia)
- `apps/crawler`: Bilibili stats & discovery crawler daemon and control plane (Elysia)
- `apps/web`: Web interface (Astro + Solid)
- `packages/contracts`: Shared API schemas (Zod), DTOs, and error taxonomy (`AppError`, `ErrorCodeEnum`)
- `packages/catalog`: Core catalog domain logic (songs, artists, singers, engines), readers, writers, search
- `packages/authentication`: User authentication, session management, and RBAC (Better Auth)
- `packages/db`: Primary Prisma schema and generated database client
- `packages/snapshot-db`: TimescaleDB snapshot and tracking Prisma 8 client
- `packages/network-scheduler`: Resilient HTTP client, rate-limiting, and network adapters
- `packages/embedding`: Standalone vector embedding REST service
- `packages/logger`: Shared Pino logger configuration
- `packages/observability`: OpenTelemetry SDK and span instrumentation
- `packages/env`: Type-safe environment variable validation (`@t3-oss/env-core`)

## 2. Core Mental Model & Architecture

When developing backend features, you MUST adhere to the Layered Architecture: `Handler -> Service -> Repository`.

### Responsibility Isolation
1. **Handler (`apps/backend`, `apps/crawler/src/controlPlane`)**: Only handles HTTP requests/responses, validates via Zod schemas, and delegates to Services. Never write business logic in handlers.
2. **Service (`packages/catalog`, etc.)**: Contains pure business logic. Calls Repositories. Throws `AppError` on failure.
3. **Repository (`packages/catalog`, `apps/crawler`, etc.)**: Implements pure database operations using Prisma / raw SQL.
4. **DTOs & Schemas (`packages/contracts`)**: All request/response validation schemas and corresponding types exist here.

### Deployment & Operations
- **Single Compose Stack**: Production and development backing services are defined in a single `docker-compose.yml` controlled via `.env`.
- **Database Migrations**: Handled automatically on container boot via `CMD` in `Dockerfile`.
- **Deployment**: Production deployment is performed via standard Docker commands (`docker compose pull && docker compose up -d`) or `./scripts/deploy.sh`. Never create ad-hoc background servers or mutating script daemons.

## 3. Strict Constraints & Safety

These rules are absolute. Violations will cause pipeline or runtime failures.

### Type Safety [CRITICAL]
- **[PROHIBITED]** `any` type: Never use `any`.
- **[PROHIBITED]** Inline type assertions: Do not use `as SomeType`, use proper type annotations.
- **[PROHIBITED]** `// @ts-ignore` or `// @ts-expect-error` in first-party code. (Only allowed in third-party code if accompanied by a GitHub issue URL).
- **[PROHIBITED]** Defining local interfaces scoped to a single file for API contracts.
- **[REQUIRED]** Import database types directly from `@cvsa/db` or `@cvsa/snapshot-db` (e.g., `Song`, `Artist`, `VideoTracking`).

### Validation & Zod
- **[PROHIBITED]** `z.any()` in any schema.
- **[PROHIBITED]** `import { t } from "elysia"`. Always use Zod, never Elysia's TypeBox.
- **[PROHIBITED]** Defining Zod schemas inline inside handlers.
- **[REQUIRED]** Define all shared API Zod schemas in `packages/contracts` first.
- **[REQUIRED]** Use `z.infer<typeof Schema>` to derive TypeScript types from Zod schemas.

### Database & Error Handling
- **[PROHIBITED]** Modifying Prisma schemas unless explicitly instructed by the user.
- **[PROHIBITED]** Using `try-catch` blocks inside Elysia handlers.
- **[REQUIRED]** Throw `AppError` directly from Services.
- **[PROHIBITED]** Decorative divider comments (e.g. `// ------------------`). Write clean, self-documenting code.

## 4. Coding Standards

### Naming Conventions
- **PascalCase**: Classes (`UserService`), Interfaces (`SignupRequest`), Types, and Class file names (`AppError.ts`).
- **camelCase**: Functions (`getUserById`), Variables, and standard file names (`authHandler.ts`).
- **UPPER_SNAKE_CASE**: Constants (`MAX_RATE_LIMIT`).

### Module-Specific Information
- **Backend API (`apps/backend`)**:
	1. Endpoints start with `/v2` prefix (configured at root router). In handlers, always use the complete path **without** the version prefix (e.g. `/song/:id/details`).
	2. **[PROHIBITED]**: DO NOT use verbs in paths. Endpoints must strictly follow RESTful conventions.
	3. CORS is configured for multi-subdomain routing (`zh.`, `en.`, `api.projectcvsa.com`). Always keep `allowedHeaders` and `exposedHeaders` (e.g. `x-trace-id`) aligned with client transport.

#### Web App API Client (`apps/web`)

The browser talks to the backend through Eden Treaty via `@lib/api`, typed by the contract exported from `apps/backend/src/apiContract.ts`.

1. Add a wrapper in `apps/web/src/lib/api/<module>.ts` and export it from `apps/web/src/lib/api/index.ts`. Components call `api.<module>.<action>(...)`, never raw `fetch`.
2. `@api-contract` is a **type-only** entry point imported through a `tsconfig` path alias — always `import type`, and never add `@cvsa/backend` as a dependency.
3. `x-locale` and `accept-language` are attached automatically from `<html lang>`, and `credentials: "include"` is always set. Do not pass them per call.
4. Errors arrive as `ApiResult<...>` with a backend `code`, translated `message` and `traceId`. Map codes to UI states; do not parse response bodies in components.

#### Component Styling & Design Tokens (`apps/web`)

The web design system lives in `apps/web/uno.config.ts` (colors, typography scale, `ts-*` shortcuts) and `apps/web/src/lib/theme.ts` (CSS variables).

1. **[REQUIRED]** Compose classes with `cn()` from `@lib/cn` (clsx + token-aware `tailwind-merge`). Never import `clsx` directly; `cn()` resolves conflicting token utilities so caller `class` props override component defaults deterministically.
2. **[REQUIRED]** Declare component variants with `cva()` from `class-variance-authority` and derive prop types with `VariantProps`. Do not hand-write `Record<Variant, string>` style maps for new components.
3. **[REQUIRED]** Use typography tokens: `ts-caption`/`ts-label`/`ts-body`/`ts-subhead`/`ts-heading-*`/`ts-overline` (or `text-<token>` + `tracking-<token>` when a different weight is required). Raw `text-xs`/`text-sm`/`text-[12px]`, `tracking-wide`, `font-[...]` and hex colors are rejected by `apps/web/tests/design-tokens.test.ts`.
4. **[REQUIRED]** Use semantic colors (`bg-surface`, `text-primary`, `border-border`, `bg-scrim`, ...) and `font-body`/`font-code`; add new values to `lib/theme.ts`/`uno.config.ts` instead of inlining them.
5. Run `bun scripts/check-design-tokens.ts` from `apps/web` before committing UI changes; it is also enforced by the test suite.

## 5. Execution Commands & Testing

ALWAYS use `bun` as the package manager and test runner.

### Pre-PR Verification [CRITICAL]
Before pushing or creating a PR, you MUST run this exact sequence to ensure CI will pass on the first attempt:
```bash
bun run ci             # Biome lint AND format verification across entire monorepo
bun run typecheck      # Typecheck all workspace packages
bun run test           # Run all unit, contract, and integration tests
```
> [!IMPORTANT]
> Running only `bun lint` is NOT sufficient because it does not verify code formatting! GitHub Actions runs `bun run ci` (`biome ci .`), which fails on formatting differences. Always run `bun run ci` locally first.

### Helper Commands
```bash
bun run format         # Auto-format all files via Biome
bun run lint:fix       # Auto-fix linting issues via Biome
bun run test:coverage  # Run all tests with coverage
```

### Module-Specific Testing Strategy
- **Backend (`apps/backend`)**: Write End-to-End (E2E) tests using Elysia Eden Treaty.
- **Catalog & Services (`packages/catalog`)**: Write Unit tests with mocked repositories.
- **Crawler (`apps/crawler`)**: Test schedulers, state machines, protocol adapters, and pipelines with in-memory or fake stores.

## 6. Version Control & Collaboration

### VCS Tooling (jujutsu / git)
- Prefer `jj` (Jujutsu) over `git` if available. Use "jujutsu-vcs" skill before performing VCS operations. Always pass `--no-pager` to avoid hanging non-interactive shells.
- If `jj` is unavailable, fallback to `git` with extreme caution.

### Workflow & Branching
1. Branch from `main` (or active base as requested).
2. Format: `<type>/<developerName>-<issueID>-<name>` (e.g., `fix/jack-132-song-api`).
3. Commit Message Format (Conventional Commits):
   `<type>(optional scope): <description>`
   Types allowed: `feat`, `fix`, `update`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `chore`, `revert`.
4. PR Requirements: The PR title must follow the conventional commit format (e.g. `fix(deploy): unify deployment configuration`). The PR description must contain `## Changes` and `## Related` sections. Maintainers squash & merge.
