# Guide for AI Agents

## Project Overview

CVSA (Chinese Vocal Synthesizer Archive) is a monorepo containing:
- `apps/backend` — REST API (Elysia + Prisma + PostgreSQL)
- `apps/frontend` — Not yet implemented
- `packages/db` — Prisma schema and database client
- `packages/core` — Shared business logic
Tech Stack: Bun, Turborepo, Elysia, Prisma, TypeScript, Biome

## Commands

Always use `bun` when installing packages, running lint or tests.

### Root (Monorepo)

```bash
# Lint all code with Biome
bun lint
# Fix linting issues automatically
bun lint:fix
# Format code with Biome
bun format
# Run all tests
bun test
# Type check all packages
bun typecheck
```

### Backend (`apps/backend`) and Core (`packages/core`)

```bash
# Run all tests
bun test
# Run tests with coverage
bun test:coverage
# Type check
bun typecheck
```

## Code Style

Please keep your code style consistent with the existing files in the codebase.

### Naming Conventions

- Files: camelCase (default) or PascalCase (for classes) — `authHandler.ts`, `AppError.ts`
- Classes: PascalCase — `AppError`, `UserService`
- Functions: camelCase — `getUserById`, `signupUser`
- Variables: camelCase — `userInfo`, `tokenCookie`
- Constants: UPPER_SNAKE_CASE — `DAY = 86400`, `MAX_RATE_LIMIT`
- Interfaces: PascalCase — `SignupRequest`, `UserResponse`
- Types: PascalCase — `type App = typeof app`

### Imports & Exports

Import priority:
1. Built-in/External packages
2. Workspace packages (`@project-cvsa/core`)
3. Path aliases
	Note: Always use path aliases over relative imports when available
	```
	// apps/backend
	@/*        → ./src/*
	@modules/* → ./src/modules/*
	@common/*  → ./src/common/*
	```
4. Relative paths

### Error Handling

In backend, All errors extend `AppError` (`apps/backend/src/common/error/AppError.ts`),
and handlers should directly throw an AppError without wrapping code in `try-catch` block.

### Patterns

- Repository: 

## Database (Prisma)

The schema is located under `packages/db/prisma/schema.prisma`.
DO NOT modify the schema, unless the user asks you to do so.

## Testing

- Backend: end to end tests using Elysia Eden Treaty.
- Core: unit tests for services and other functions and integration tests for repositories.
	- for services, unit tests will use a mocked repository
	- for repositories, integration tests will connect to a test DB

## Version Control

This project recommends, but does not mandate, the use of jujutsu (jj) for version control. Prefer using `jj` over `git` commands. 

**NOTE**: If `jj` is not available on user's computer, you can still use `git` (but with extra caution).

There's a skill called `Use Jujutsu` that can guide you on how to use jj. You can check it out before doing VCS operations (commit, status, branch, push, etc.).

The commit message follows the conventional commits:

```text
<type>(optional scope): <description>

[optional body]

[optional footer(s)]
```

Available types are: `feat`, `fix`, `update`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `chore` and `revert`.
