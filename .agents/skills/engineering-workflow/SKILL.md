---
name: engineering-workflow
description: CVSA's human-agent software engineering workflow combining `apps/docs/content/`, GitHub Issues, and Jujutsu (`jj`). Activate across active product, backend, crawler, and web feature development beyond tiny few-line edits, including defining requirements, making architecture decisions, designing contracts, breaking work into Issues, scaffolding packages, implementing features, and syncing changes back to docs. Skip only for tiny few-line fixes or standalone documentation edits (`docs-authoring`).
---

# Human-Agent Engineering Workflow

This skill guides collaborative software development across CVSA so fast implementation produces clean, maintainable TypeScript systems without drifting from shared intent.

## 1. Role Division: Docs, Issues, and VCS

- **`apps/docs/content/`**: Durable context for contributors and agents, including repository layout (`engineering/repository.md`), architecture (`engineering/architecture.md`), settled decisions (`decisions/`), interface contracts (`engineering/specs/`), active roadmaps (`plans/`), external references (`references/`), and early notes (`ideas/`).
- **Issues (`gh` CLI)**: Actionable execution slices with priority, rough scope, dependencies, milestones, and verifiable completion criteria. Keep task checklists out of `apps/docs/content/`.
- **Jujutsu (`jj`)**: Binds contract updates, implementation, tests, and documentation edits into logical commits referencing the owning Issue.

## 2. Standard Engineering Flow

1. **Phase 1: Problem and requirements**
   - Define the problem, affected users or subsystems, core goals, non-goals, and priorities before proposing implementation details.
   - Capture raw exploratory thoughts in `apps/docs/content/ideas/` (`status: draft`) or scoped proposals under `apps/docs/content/plans/`.
2. **Phase 2: Architecture and key decisions**
   - Evaluate structural trade-offs (database ownership between `@cvsa/db` and `@cvsa/snapshot-db`, `Handler -> Service -> Repository` boundaries, client/crawler decoupling) against the agreed requirements.
   - Record hard-to-reverse choices under `apps/docs/content/decisions/` (`000N-...`) before building feature code around them.
3. **Phase 3: Interfaces and contracts**
   - Define shared Zod schemas, DTOs, and `ErrorCodeEnum` entries in `packages/contracts` (`@cvsa/contracts`) and document cross-boundary contracts in `apps/docs/content/engineering/specs/`.
   - Start from core invariants rather than freezing every edge field upfront, and update `@cvsa/contracts` alongside backend and `@lib/api` / crawler consumers in the same change unit.
4. **Phase 4: Engineering design**
   - Confirm module boundaries, data ownership, testing strategy (`apps/docs/content/engineering/practices/testing.md`), and local verification commands in the touched subproject's `AGENTS.md`.
5. **Phase 5: Work breakdown in Issues**
   - Keep module-level status and milestones in `apps/docs/content/plans/`, and split executable vertical slices into GitHub Issues with clear acceptance criteria.
   - Confirm with the user before creating or modifying Issues via `gh`.
6. **Phase 6: Package initialization**
   - When creating a new app or workspace package, read [Repository Layout](../../../apps/docs/content/engineering/repository.md), [Testing](../../../apps/docs/content/engineering/practices/testing.md), relevant `decisions/`, and `turbo.json` first.
   - Land a minimal runnable skeleton with strict TypeScript (`@cvsa/typescript-config`), Biome compliance, a local `AGENTS.md`, and passing checks before building features.
7. **Phase 7: Iterative delivery and documentation sync**
   - Implement one vertical slice at a time in isolated `jj` changes (load `jujutsu-vcs` first, pass `--no-pager`), verifying every touched package with `code-verification` and `testing`.
   - When implementation changes external behavior, contracts, operational constraints, or CLI commands, use `docs-authoring` to update affected pages under `apps/docs/content/` in place (removing `reviewed: true` on any edited marked page, and asking maintainers before altering settled specs, plans, or `decisions/`).

## 3. Entry Points by Task Size

- **New app, package, or major subsystem**: Start at Phase 1 and move sequentially through Phase 7.
- **Active feature development**: Enter at Phase 1 (when scope is open), Phase 3 (when new schemas or endpoints are needed), or Phase 5 (when contracts and design are settled).
- **Scoped bug fix or internal refactor (beyond a few lines)**: Enter at Phase 7, and skip documentation edits when external behavior, contracts, and durable constraints remain unchanged.
