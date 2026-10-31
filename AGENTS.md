# System Prompt & Guide for AI Agents

## 1. System Context
Project: CVSA (Chinese Vocal Synthesizer Archive)
GitHub Repository: [project-cvsa/cvsa](https://github.com/project-cvsa/cvsa)
Repository Type: Monorepo (Turborepo)
Tech Stack: Bun, Elysia, Drizzle ORM, TimescaleDB, PostgreSQL, Zod, TypeScript, Biome, UnoCSS

### Workspace Structure
- `apps/backend`: REST API & outbox service (Elysia)
- `apps/crawler`: Bilibili stats & discovery crawler daemon and control plane (Elysia)
- `apps/web`: Web interface (Astro + Solid)
- `apps/embedding`: Standalone vector embedding REST service
- `apps/deploy`: Production host deployment service
- `packages/contracts`: Shared API schemas (Zod), DTOs, and error taxonomy (`AppError`, `ErrorCodeEnum`)
- `packages/catalog`: Core catalog domain logic (songs, artists, singers, engines), readers, writers, search
- `packages/authentication`: User authentication, session management, and RBAC (Better Auth)
- `packages/db`: Primary catalog database schema and client (Drizzle ORM)
- `packages/snapshot-db`: TimescaleDB snapshot, tracking, and discovery persistence (Drizzle ORM)
- `packages/network-scheduler`: Resilient HTTP client, rate-limiting, and network adapters
- `packages/logger`: Shared Pino logger configuration
- `packages/observability`: OpenTelemetry SDK and span instrumentation
- `packages/env`: Type-safe environment variable validation (`@t3-oss/env-core`)

## 2. Pragmatic Engineering & Anti-Defensiveness

### 1. No Jargon Theater & Phantom Disclaimers
- Strictly avoid pseudo-rigorous corporate jargon and audit theatre in communication, docs, and pull requests:
  `核验`, `检索`, `探针`, `检查`, `审计`, `评估`, `冻结`, `快照`, `哈希`, `夹具`, `门禁`, `回滚`, `基线`, `指纹`, `证据链`, `不可抵赖`, `验收矩阵`, `故障注入`, `灰度放量`, `演练归档`.
- Address only the explicit scope requested.
- Do not fabricate unmentioned requirements (B, C, D) just to proclaim that "A does not imply B, prove C, or guarantee D".
- Do not write legalistic disclaimers in technical docs, PRs, or chats (e.g., “不是……”, “不代表…”, "不能声称...", "不构成...的证据", "这不是…", "不能说明…"). State what the system does and its verified limits plainly; do not write CYA contracts.

### 2. No Paranoid Defensive Coding
- Trust system boundaries: Validate inputs strictly at runtime boundaries (Zod schemas at HTTP/CLI edges).
- Once inside the application domain, trust TypeScript's type system.
- Do not write redundant null/undefined checks, fallback defaults, or type guards on data already validated upstream.
- Do not wrap internal logic in catch-all try-catch blocks that silently swallow errors or return arbitrary fallbacks. Let real exceptions surface to the centralized error handler (`AppError`).

### 3. Testing Principles
We write tests to guard externally visible behavior and provide a safety net for future refactorings, not to inflate coverage metrics or take snapshots of internal implementations.

- Test public behavior, not implementation details:
  - Tests should interact exclusively through public APIs, service entry points, or protocol interfaces, asserting on returned values, final persistence states, or emitted domain events.
  - Do not mock private methods, assert on internal execution paths, or inspect temporary variable state. When internal logic is rewritten without altering external behavior, the tests must continue to pass without change.
- Deterministic and zero-flakiness:
  - Do not rely on fragile real-time timeouts (such as arbitrary millisecond sleeps) or uncoordinated network races. Use virtual clocks or explicit synchronization for time-dependent logic.
  - Every test must be self-contained and idempotent, never relying on execution order or residual database state from preceding cases.
- Meaningful business contracts:
  - Test descriptions must clearly describe the scenario and expected outcome, acting as readable specifications of system behavior.
  - Do not write tautological assertions that only re-verify TypeScript compiler types, and do not introduce ad-hoc test suites.

### 4. No Ad-hoc Solutions
- Unless explicitly requested by the user, do not introduce one-off scripts, ad-hoc validation tools, temporary monkey-patches, or arbitrary regex scanners to plaster over problems.
- Address issues at their architectural root using the repository's established tools (Turborepo, Drizzle, Elysia contracts, Biome). Do not invent custom ad-hoc conventions or temporary band-aids.

## 3. Interaction & Execution Principles

1. Treat all questions, architecture discussions, root cause investigations, and reviews as read-only, after investigating the root cause, suggest a implementation plan and execute it only after user's approval.
2. Grounded and verified: Never assume architecture, dependencies, or data flows without checking the code or searching the web first. Verify numbers and metrics with actual runs internally rather than estimating, and present only the clean, final findings without dumping raw inspection logs.
3. Drive to completion: When explicitly instructed to implement, complete all planned steps and run verification (`bun run ci && bun run typecheck && bun run test`) before handing control back. Do not stop halfway through an agreed task just to report partial progress.
4. Natural language and documentation boundaries: Unless explicitly requested by the user, do not edit documentation files, READMEs, or add verbose explanatory comments. If code changes make existing documentation or README sections obsolete, explicitly note this in your response (e.g., `[Notice] README section X is now obsolete due to Y`) instead of modifying it unilaterally.
5. Concrete constraint reporting: If a genuine technical limitation exists, state it in one concrete factual sentence (e.g., `batch query is limited to 500 IDs due to parameter limits`), never as an abstract legal disclaimer.

## 4. Core Architecture

When developing backend features, adhere to the Layered Architecture: `Handler -> Service -> Repository`.

### Responsibility Isolation
1. Handler (`apps/backend`, `apps/crawler/src/controlPlane`): Only handles HTTP requests/responses, validates via Zod schemas, and delegates to Services. Never write business logic in handlers.
2. Service (`packages/catalog`, etc.): Contains pure business logic. Calls Repositories. Throws `AppError` on failure.
3. Repository (`packages/catalog`, `apps/crawler`, etc.): Implements pure database operations using Drizzle ORM / raw SQL.
4. DTOs & Schemas (`packages/contracts`): All request/response validation schemas and corresponding types exist here.

### Deployment & Operations
- Single Compose Stack: Production and development backing services are defined in a single `docker-compose.yml` controlled via `.env`.
- Database Migrations: Handled automatically on container boot via `CMD` in `Dockerfile`.
- Deployment: Production deployment is performed via standard Docker commands (`docker compose pull && docker compose up -d`) or the `apps/deploy` deployment service. Never create ad-hoc background servers or mutating script daemons.

## 5. Strict Constraints & Safety

These rules are absolute. Violations will cause pipeline or runtime failures.

### Type Safety
- Never use the `any` type.
- Do not use inline type assertions (`as SomeType`); use proper type annotations.
- Never use `// @ts-ignore` or `// @ts-expect-error` in first-party code (only allowed in third-party code if accompanied by an explanatory issue URL).
- Do not define local interfaces scoped to a single file for API contracts.
- Import database types directly from `@cvsa/db` or `@cvsa/snapshot-db` (e.g., `Song`, `Artist`, `VideoTracking`).

### Validation & Zod
- Never use `z.any()` in any schema.
- Always use Zod, never Elysia's TypeBox (`import { t } from "elysia"` is prohibited).
- Do not define Zod schemas inline inside handlers.
- Define all shared API Zod schemas in `packages/contracts` first.
- Use `z.infer<typeof Schema>` to derive TypeScript types from Zod schemas.

### Database & Error Handling
- Do not modify database schemas or migrations unless explicitly instructed by the user.
- Do not use `try-catch` blocks inside Elysia handlers.
- Throw `AppError` directly from Services.
- Do not use decorative divider comments (e.g. `// ------------------` or `# ==================`). Write clean, self-documenting code.

## 6. Coding Standards

### Naming Conventions
- PascalCase: Classes (`UserService`), Interfaces (`SignupRequest`), Types, and Class file names (`AppError.ts`).
- camelCase: Functions (`getUserById`), Variables, and standard file names (`authHandler.ts`).
- UPPER_SNAKE_CASE: Constants (`MAX_RATE_LIMIT`).

### Module-Specific Information

#### Backend API (`apps/backend`)
1. Endpoints start with `/v2` prefix (configured at root router). In handlers, always use the complete path without the version prefix (e.g. `/song/:id/details`).
2. Do not use verbs in paths; endpoints must strictly follow RESTful conventions.
3. CORS is configured for multi-subdomain routing (`zh.`, `en.`, `api.projectcvsa.com`). Always keep `allowedHeaders` and `exposedHeaders` (e.g. `x-trace-id`) aligned with client transport.

#### Web App API Client (`apps/web`)
The browser talks to the backend through Eden Treaty via `@lib/api`, typed by the contract exported from `apps/backend/src/apiContract.ts`.

1. Add a wrapper in `apps/web/src/lib/api/<module>.ts` and export it from `apps/web/src/lib/api/index.ts`. Components call `api.<module>.<action>(...)`, never raw `fetch`.
2. `@api-contract` is a type-only entry point imported through a `tsconfig` path alias — always `import type`, and never add `@cvsa/backend` as a dependency.
3. `x-locale` and `accept-language` are attached automatically from `<html lang>`, and `credentials: "include"` is always set. Do not pass them per call.
4. Errors arrive as `ApiResult<...>` with a backend `code`, translated `message` and `traceId`. Map codes to UI states; do not parse response bodies in components.

#### Component Styling & Design Tokens (`apps/web`)
The web design system lives in `apps/web/uno.config.ts` (colors, typography scale, `ts-*` shortcuts) and `apps/web/src/lib/theme.ts` (CSS variables).

1. Compose classes with `cn()` from `@lib/cn` (clsx + token-aware `tailwind-merge`). Never import `clsx` directly; `cn()` resolves conflicting token utilities so caller `class` props override component defaults deterministically.
2. Declare component variants with `cva()` from `class-variance-authority` and derive prop types with `VariantProps`. Do not hand-write `Record<Variant, string>` style maps for new components.
3. Use typography tokens: `ts-caption`/`ts-label`/`ts-body`/`ts-subhead`/`ts-heading-*`/`ts-overline` (or `text-<token>` + `tracking-<token>` when a different weight is required). Avoid raw font size / tracking numbers when a token exists.
4. Use semantic colors (`bg-surface`, `text-primary`, `border-border`, `bg-scrim`, ...) and `font-body`/`font-code`; add new values to `lib/theme.ts`/`uno.config.ts` instead of inlining them.

## 7. Execution Commands & Testing

Always use `bun` as the package manager and test runner.

### Pre-PR Verification
Before pushing or creating a PR, run this exact sequence to ensure CI will pass on the first attempt:
```bash
bun run ci             # Biome lint AND format verification across entire monorepo
bun run typecheck      # Typecheck all workspace packages
bun run test           # Run all unit, contract, and integration tests
```
Running only `bun lint` is not sufficient because it does not verify code formatting. GitHub Actions runs `bun run ci` (`biome ci .`), which fails on formatting differences. Always run `bun run ci` locally first.

### Helper Commands
```bash
bun run format         # Auto-format all files via Biome
bun run lint:fix       # Auto-fix linting issues via Biome
bun run test:coverage  # Run all tests with coverage
```

### Module-Specific Testing Strategy
- Backend (`apps/backend`): Write End-to-End (E2E) tests using Elysia Eden Treaty.
- Catalog & Services (`packages/catalog`): Write Unit tests with mocked repositories.
- Crawler (`apps/crawler`): Test schedulers, state machines, protocol adapters, and pipelines with in-memory or fake stores.

## 8. Version Control & Workspace Hygiene

### VCS Hygiene & Change Isolation
- Never mix changes into existing dirty work: Check VCS status (`jj status` / `git status`) before doing anything. If the current working copy contains pre-existing uncommitted user changes, do not write over them or bundle them into your task.
  - In Jujutsu (`jj`), create a separate change revision (`jj new`) off the appropriate base instead of dumping edits into a dirty working copy.
  - In Git, stage only the files you intentionally modified. Never run `git add .` or `git commit -a` to blindly sweep existing unstaged files into a commit.

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

## 9. Quality Check

After any changes more than 2 files or 30 lines done, explicitly ask yourself:
1. Did the code I wrote follow general best practices and respect the existing architecture?
2. Did I implicitly make any changes that the user did not request?
3. Did I strictly follow all instructions and constraints in AGENTS.md and related project guidelines?

Mark and report the check result clearly to the user.
