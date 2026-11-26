---
name: code-verification
description: Repository-wide standards for running formatting, Biome linting, fanee i18n checks, TypeScript typechecking, tests, builds, and docs checks before concluding work in CVSA. Activate when verifying code changes, fixing lint or type errors, preparing commits, or checking touched subprojects.
---

# Code Verification

Follow these repository-wide standards across all CVSA apps and packages before concluding any change.

## 1. Discover and Run Package-Local Checks

Do not guess check commands from memory:

1. Inspect the touched directory's `AGENTS.md` and `package.json` to find every script declared for that subproject.
2. Run formatting, linting, strict typechecking, tests, and builds until every command exits with code `0`.
3. Never bypass checks by adding `any`, `as SomeType`, `@ts-ignore`/`@ts-expect-error`, `z.any()`, disabling Biome rules globally, or claiming partial filtered runs as full passes.

Note: If `BIOME_CONFIG_PATH` is set in the shell environment, prefix Biome commands with `env -u BIOME_CONFIG_PATH` so the repository's `biome.json` is used.

## 2. Stack Expectations Across CVSA

### Monorepo Root (Pre-PR & Final Handoff)

Run the full root sequence after provisioning test databases (`bun run setup` when backing Compose services `db`, `snapshot-db`, `redis`, `redis-cache`, `meili` are running):

```bash
bun run ci
bun run typecheck
bun run test
```

`bun run ci` runs `bunx --bun biome ci . && bun run --bun fanee check --unused`. Apply mechanical formatting with `bunx --bun biome check --write <paths>` (or `bun run format` when appropriate for the whole repo).

### Backend & Shared Packages (`apps/backend`, `packages/contracts`, `packages/catalog`, `packages/authentication`)

```bash
bun run --cwd <dir> lint
bun run --cwd <dir> typecheck
bun run --cwd <dir> test
```

Also run `bun run --cwd apps/backend build` when changing server entrypoints or packaging. Backend E2E tests require test backing services (`db`, `redis`, `meili`) and `bun run --cwd packages/db test:setup`.

### Crawler & Snapshot DB (`apps/crawler`, `packages/snapshot-db`)

```bash
bun run --cwd apps/crawler lint
bun run --cwd apps/crawler typecheck
bun run --cwd apps/crawler test
bun run --cwd apps/crawler build
```

Offline unit tests (for example `bun test apps/crawler/tests/discovery.test.ts`) run without DB; `*.db.test.ts` and `packages/snapshot-db` tests require the `snapshot-db` TimescaleDB container and `bun run --cwd packages/snapshot-db test:setup`.

### Web App (`apps/web`)

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
bun run ci
```

Never start local dev servers or browsers to self-approve UI unless explicitly requested by the user.

### Documentation (`apps/docs`)

```bash
bun run --cwd apps/docs types:check
bun run --cwd apps/docs build
bun run ci
```

### Deploy (`apps/deploy`)

```bash
bun run --cwd apps/deploy typecheck
bun run --cwd apps/deploy test
bun run ci
```

## 3. Testing Quality Check

Follow `.agents/skills/testing/SKILL.md` and [Testing standards](../../../apps/docs/content/engineering/practices/testing.md) whenever adding or updating tests.

## 4. Pre-Completion Documentation Sync Check

Before concluding any task, inspect `jj --no-pager diff --stat`:

1. Determine whether the change altered external behavior, HTTP/Zod contracts, CLI commands, dependencies, directory layout, or uncovered a lasting constraint.
2. If yes, follow `.agents/skills/docs-authoring/SKILL.md` to update affected pages under `apps/docs/content/` in place (removing `reviewed: true` whenever modifying a marked page, and asking maintainers first before changing settled specs, plans, or `decisions/`).
3. If any file under `apps/docs/` changed, finish with `bun run --cwd apps/docs types:check`, `bun run --cwd apps/docs build`, and `bun run ci`.
