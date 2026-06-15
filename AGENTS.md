# System Prompt & Guide for AI Agents

## 1. System Context
**Project:** CVSA (Chinese Vocal Synthesizer Archive)
**GitHub Repository**: [project-cvsa/cvsa](https://github.com/project-cvsa/cvsa)
**Repository Type:** Monorepo (Turborepo)
**Tech Stack:** Bun, Elysia, Prisma, PostgreSQL, Zod, TypeScript, Biome

### Workspace Structure
- `apps/backend`: REST API (Elysia)
- `apps/frontend`: Web interface (Not yet implemented)
- `packages/db`: Prisma schema and generated database client
- `packages/core`: Shared business logic, DTOs, and Zod schemas
- `packages/embedding`: A standalone embedding REST service
- `packages/logger`: The application logger setup
- `packages/observability`: Observability configurations
- `packages/env`: Package for managing environment variables

## 2. Core Mental Model & Architecture

When working on the backend, you MUST adhere to the Layered Architecture: `Handler -> Service -> Repository`. 

### Responsibility Isolation
1. **Handler (`apps/backend`)**: Only handles HTTP requests/responses, validates via Zod schemas, and calls Services. Never write business logic here.
2. **Service (`packages/core`)**: Contains pure business logic. Calls Repositories. Throws `AppError` on failure.
3. **Repository (`packages/core`)**: Implements pure database operations using Prisma.
4. **DTOs (`packages/core`)**: All request/response validation schemas and corresponding types exist here.

### File Organization Mapping
If building a module named `[module]`, enforce this strict tree:
```text
apps/backend/src/handlers/[module]/
├── index.ts                  # Exports handlers
└── [method].ts               # Elysia routes

packages/core/src/modules/[module]/
├── index.ts                  # Public API exports
├── dto.ts                    # Zod schemas (Validation & Types)
├── service.ts                # Business logic
├── repository.ts             # Prisma DB operations
├── container.ts              # DI container
└── repository.interface.ts   # DB contract
```

## 3. Strict Constraints & Safety

These rules are absolute. Violation will cause pipeline or runtime failures.

### Type Safety [CRITICAL]
- **[PROHIBITED]** `any` type: Never use `any`.
- **[PROHIBITED]** Inline type assertions: Do not use `as SomeType`, use type annotations.
- **[PROHIBITED]** `// @ts-ignore` or `// @ts-expect-error` in first-party code. (Only allowed in third-party code if a GitHub issue URL appended).
- **[PROHIBITED]** Defining local interfaces scoped to a single file for API contracts.
- **[REQUIRED]** Import database types directly from `@cvsa/db` (e.g., `Song`, `Artist`).

### Validation & Zod
- **[PROHIBITED]** `z.any()` in any schema.
- **[PROHIBITED]** `import { t } from "elysia"`. Always use Zod, never Elysia's TypeBox.
- **[PROHIBITED]** Defining Zod schemas inline inside handlers.
- **[REQUIRED]** Define all Zod schemas in `packages/core/modules/<module>/dto.ts` first.
- **[REQUIRED]** Use `z.infer<typeof Schema>` to derive TypeScript types from Zod schemas.

### Database & Error Handling
- **[PROHIBITED]** Modifying Prisma schema unless explicitly instructed by the user.
- **[PROHIBITED]** Using `try-catch` blocks in Elysia Handlers.
- **[REQUIRED]** Throw `AppError` directly from Services.

## 4. Coding Standards

### Naming Conventions
- **PascalCase**: Classes (`UserService`), Interfaces (`SignupRequest`), Types, and Class file names (`AppError.ts`).
- **camelCase**: Functions (`getUserById`), Variables, and standard file names (`authHandler.ts`).
- **UPPER_SNAKE_CASE**: Constants (`MAX_RATE_LIMIT`).

### Module-Specific Information
- **Backend**:
	1. Our endpoints starts with `/v2` and this prefix is already configured in root handler. In all of the rest handlers, always use the complete path **without** the version prefix (e.g. `/song/:id/details`)
	2. **[PROHIBITED]**: DO NOT use verbs in paths. Endpoints should strictly follows the RESTful pattern.

## 5. Execution Commands & Testing

ALWAYS use `bun` as the package manager, test/command runner.

### Global Monorepo Commands
```bash
bun lint				# Check code issues via Biome
bun lint:fix			# Auto-fix code issues
bun format				# Format code via Biome
bun typecheck			# Run tsc across all packages
# IMPORTANT: ALWAYS use `bun run test`
# [PROHIBITED]: Directly run `bun test` without `run`
bun run test			# Run all tests globally
bun run test:coverage	# Run all tests with coverage
```

### Module-Specific Testing Strategy
When writing tests, apply the following methodologies:
- **Backend (`apps/backend`)**: Write End-to-End (E2E) tests using Elysia Eden Treaty.
- **Core Services (`packages/core`)**: Write Unit tests. Mock the repository layer.
- **Core Repositories (`packages/core`)**: Write Integration tests connecting to a test database.

## 6. Version Control & Collaboration

### VCS Tooling (jujutsu / git)
- Prefer `jj` (Jujutsu) over `git` if available. Use "jujutsu-vcs" skill before performing VCS operations.
- If `jj` is unavailable, fallback to `git` with extreme caution.

### Workflow & Branching
1. Branch from `develop`.
2. Format: `<type>/<developerName>-<issueID>-<name>` (e.g., `fix/jack-132-song-api`).
3. Commit Message Format (Conventional Commits):
   `<type>(optional scope): <description>`
   Types allowed: `feat`, `fix`, `update`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `chore`, `revert`.
4. PR Requirements: The PR title should be a commit message format (e.g. `feat(auth): implement forgot password`) that describe all changes within it. The PR description must contain `## Changes` and `## Related` sections. Maintainers will squash & merge.
