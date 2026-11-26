---
name: docs-authoring
description: Guide for creating, organizing, updating, and reviewing documentation under `apps/docs/content/`, plus syncing confirmed engineering changes back into existing pages. Activate when drafting specs, plans, ideas, architecture decisions, external references, or updating documentation after code changes.
---

# Documentation Authoring (`apps/docs/content/`)

CVSA maintains one shared engineering and user knowledgebase under `apps/docs/content/` for open-source contributors and coding agents.

Follow [How We Docs](../../../apps/docs/content/engineering/how-we-docs/index.md).

## 1. How `apps/docs/content/` Is Organized

Top-level sections separate audience and lifecycle:

- **`(manual)/`**: Public user manual for CVSA (`index.md`, `index.en.md`, `scope-of-inclusion.md`).
- **`engineering/`**: Repository layout (`repository.md`), setup guide (`guide.md`), architecture (`architecture.md`), documentation standards (`how-we-docs/`), coding/testing/UI practices (`practices/`), technical specifications (`specs/`), and archived historical notes (`legacy/`).
- **`plans/`**: Active subsystem status and forward roadmaps (`project-status.md`, `crawler-and-discovery-roadmap.md`, `auth-and-web-roadmap.md`).
- **`decisions/`**: Immutable, numbered architecture decision records (`0001-...`).
- **`references/`**: Verified external constraints for Bilibili APIs, TimescaleDB/Drizzle, OpenTelemetry/SigNoz, search/embedding, and deployment.
- **`ideas/`**: Early exploratory thoughts (`status: draft`) kept separate from committed plans and decisions.

Every section opens with an `index.md` overview and declares navigation ordering in `meta.json`.

## 2. Using `reviewed` Pages and Removing `reviewed: true`

- Pages marked `reviewed: true` (findable via `rg -l "^reviewed:\s*true" apps/docs/content/`) represent human-verified writing quality and facts. Do not imitate unreviewed drafts.
- Never add `reviewed: true`. Whenever you make any edit to an existing page marked `reviewed: true`, delete `reviewed: true` from its frontmatter so a maintainer reviews the diff.

## 3. Choosing Location, `docType`, and `status`

Select three independent properties compatible with [apps/docs/source.config.ts](../../../apps/docs/source.config.ts) and [Content types](../../../apps/docs/content/engineering/how-we-docs/content-types.md):

1. **Location**: Place material in the folder that owns the topic, updating existing pages in place before creating new files.
2. **Reader goal (`docType`)**: Pick one primary form (`tutorial`, `how-to`, `reference`, `explanation`, or `plan`) so task steps, lookup contracts, and conceptual rationales stay separated.
3. **Lifecycle (`status`)**: Omit for active settled behavior or completed point-in-time analyses; use `draft` for exploratory or unapproved work; `planned` for committed designs not yet implemented; `deprecated` when superseded (linking to its replacement).

## 4. Writing New or Expanded Pages

1. **Read the owning folder first**: Inspect existing pages and `meta.json` in the target section before adding or splitting files.
2. **Separate ownership clearly**: Distinguish maintainer decisions, verified facts (code, schemas, configs, dated external observations), agent synthesis, and unresolved options.
   - Ask focused questions when goals, scope, or architectural trade-offs are undecided instead of inventing decisions silently.
   - When drafting while questions remain open, isolate unresolved choices under `## Open questions`.
3. **Write and format cleanly**: Follow [Writing style](../../../apps/docs/content/engineering/how-we-docs/style.md). Use clear, direct open-source technical prose without corporate jargon, pseudo-rigorous audit theatre, meta-openings, or legalistic disclaimers. Include `title` and `docType` in frontmatter, record `Recorded YYYY-MM-DD` on time-sensitive pages, and update the owning `meta.json` whenever adding pages.
4. **Keep Fumadocs links valid**:
   - Use `./file.md` (with `.md` or `.mdx` extension) for same-folder relative links.
   - Use root-relative `/zh/...` or `/en/...` paths for cross-section doc links.
   - Use GitHub `https://github.com/project-cvsa/cvsa/blob/main/<path>` URLs when linking to repository source files outside `apps/docs/content/`.

## 5. Updating Existing Docs After Code Changes

Follow [Context for coding agents](../../../apps/docs/content/engineering/how-we-docs/context-for-agents.md):

- **Update autonomously**: Confirmed implementation facts, updated paths or CLI commands, current module status, verified external constraints, and broken links (deleting `reviewed: true` if touched).
- **Confirm with maintainers first**: Altering settled architecture principles, project direction, technical specifications (`specs/`), roadmaps (`plans/`), or modifying/deprecating `decisions/`.

## 6. Verification

After editing documentation:

```bash
bun run --cwd apps/docs types:check
bun run ci
```

When adding pages, changing routes or `meta.json`, or editing `apps/docs/` site code, also run:

```bash
bun run --cwd apps/docs build
```
