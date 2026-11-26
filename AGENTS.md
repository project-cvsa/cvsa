# Instructions for Agents

CVSA (Chinese Vocal Synthesizer Archive) is an open-source Turborepo monorepo built with Bun, Elysia, Drizzle ORM, PostgreSQL/TimescaleDB, Zod, TypeScript, Biome, Astro/SolidJS, and UnoCSS.

## Key Documentation

Read the authoritative documentation under `apps/docs/content/` instead of guessing conventions:

- Engineering overview & repository layout: [apps/docs/content/engineering/index.md](apps/docs/content/engineering/index.md), [apps/docs/content/engineering/repository.md](apps/docs/content/engineering/repository.md)
- Documentation & style standards: [apps/docs/content/engineering/how-we-docs/index.md](apps/docs/content/engineering/how-we-docs/index.md)
- Architecture, testing & GUI collaboration: [apps/docs/content/engineering/architecture.md](apps/docs/content/engineering/architecture.md), [apps/docs/content/engineering/practices/testing.md](apps/docs/content/engineering/practices/testing.md), [apps/docs/content/engineering/practices/ui-collaboration.md](apps/docs/content/engineering/practices/ui-collaboration.md)
- Plans, decisions & references: [apps/docs/content/plans/index.md](apps/docs/content/plans/index.md), [apps/docs/content/decisions/index.md](apps/docs/content/decisions/index.md), [apps/docs/content/references/index.md](apps/docs/content/references/index.md)
- Task workflows (`.agents/skills/`): `engineering-workflow`, `docs-authoring`, `testing`, `code-verification`, `web-app`, `improve-instructions`, `jujutsu-vcs`, `github-pr-workflow`

## Rules for Coding

### Version Control & Working Tree

- Prefer `jj` over `git` (load `jujutsu-vcs` first, always pass `--no-pager`). Branch from `main`, keep commit subjects and PR titles `<= 72` characters, and avoid leaving non-empty commits undescribed.
- Treat existing working-tree changes as authoritative; run `jj new` before starting unrelated edits so separate work never mixes.

### Scope, Structure & Simplicity

- Treat questions, architecture reviews, and root-cause investigations as read-only until implementation is requested. Implement only the requested scope and extend existing surfaces before adding new UI or endpoints.
- Keep functions focused with shallow nesting and shared helpers instead of duplicated logic. Validate inputs strictly with Zod at HTTP/CLI boundaries, then trust TypeScript types inside the domain without redundant fallbacks.

### Layered Backend, Type Safety & Database

- Maintain `Handler -> Service -> Repository` with shared Zod schemas/DTOs in `@cvsa/contracts` (`z.infer<typeof Schema>`). Throw `AppError` from Services; keep business logic and `try-catch` out of Elysia handlers.
- Never use `any`, `as SomeType`, `@ts-ignore`/`@ts-expect-error` in first-party code, `z.any()`, or Elysia TypeBox (`t`). Import DB types from `@cvsa/db` or `@cvsa/snapshot-db`. Do not alter DB schemas or migrations unless explicitly instructed.

### Testing & Verification

- Follow `.agents/skills/testing/SKILL.md` and `.agents/skills/code-verification/SKILL.md`. Before concluding any change, run `bun run ci && bun run typecheck && bun run test` alongside the touched subproject's local checks.

## Keeping Documentation Current

- Update affected pages under `apps/docs/content/` in place whenever work changes external behavior, contracts, paths, commands, or module status. Ask before altering settled specs, plans, or `decisions/`.
- **Strict `reviewed` & `README.md` discipline**: Never add `reviewed: true`, and remove `reviewed: true` from frontmatter whenever editing a marked page. Do not edit `README.md` unless explicitly asked.

## Security & Communication

- **Secrets**: Never read, print, or commit `.env` secrets or credentials (non-example env files). Application code reads configuration via `@cvsa/env`.
- **Prose & GUI discipline**: State verified facts and technical limits plainly in concrete prose without pseudo-rigorous audit theatre, corporate buzzwords, strawman contrasts, or legalistic disclaimers. Do not start dev servers or browsers to self-approve UI unless asked; follow [UI Collaboration](apps/docs/content/engineering/practices/ui-collaboration.md).

## Subprojects

Always inspect the touched directory's `AGENTS.md`: [backend](apps/backend/AGENTS.md), [crawler](apps/crawler/AGENTS.md), [web](apps/web/AGENTS.md), [docs](apps/docs/AGENTS.md), [deploy](apps/deploy/AGENTS.md), [contracts](packages/contracts/AGENTS.md), [db](packages/db/AGENTS.md), [snapshot-db](packages/snapshot-db/AGENTS.md).
