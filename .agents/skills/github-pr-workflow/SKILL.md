---
name: github-pr-workflow
description: Branching, Conventional Commits, pre-PR verification, Pull Request formatting, and Squash & Merge output rules for project-cvsa/cvsa. Load whenever preparing, creating, updating, or summarizing a GitHub PR.
---

# GitHub PR & Release Workflow

Follow [Workflow Standards](../../../apps/docs/content/engineering/practices/workflow.md) (`/zh/engineering/practices/workflow`). Activate `jujutsu-vcs` first whenever using `jj` for VCS operations (always pass `--no-pager`).

## Branching & Commits

1. **Base branch**: Branch from `main` (never push directly to `main`; maintainers merge via Squash & Merge).
2. **Branch / bookmark name**: `<type>/<developerName>-<issueID>-<name>` (for example, `fix/jack-132-song-api` or `feat/alikia-crawler-invitation-deploy`).
3. **Commit format (Conventional Commits)**:
   - `<type>(optional scope): <description>`
   - Allowed types: `feat`, `fix`, `update`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `chore`, `revert`.
   - Keep the subject line at or under 72 characters with a single or minimal scope; avoid comma-separated scope lists and laundry-list summaries.

## Pre-PR Verification

Run this exact sequence before pushing or opening a PR:

```bash
bun run ci
bun run typecheck
bun run test
```

Running `bun run lint` alone is insufficient because CI enforces formatting (`biome ci .`) and i18n checks (`fanee check --unused`).

## PR Title, Description & Response Requirement

1. **PR Title**: Conventional Commit format, at or under 72 characters, summarizing the main change concisely.
2. **PR Description**: Must contain `## Changes` and `## Related` sections (optionally `## Summary`), using concrete facts without pseudo-rigorous jargon or internal JJ change IDs.
3. **Mandatory Response Output**: Whenever opening or updating a PR, always include the ready-to-use **Squash & Merge commit title** (under 72 chars including `(#PR)`) and **commit description** directly in your response.
