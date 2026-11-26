---
name: improve-instructions
description: Guide for reflecting on past agent behavior, user corrections, and conversation logs to refine `AGENTS.md`, skills, or documentation instructions. Activate when the user asks to learn from mistakes, review past sessions, update agent guidance from feedback, or turn recurring corrections into durable instructions.
---

# Improving Agent Instructions from Experience

Use user corrections, observed friction, and conversation logs to tighten repository instructions without turning single incidents into ad-hoc patches.

## 1. Gather Concrete Evidence

1. Review explicit user corrections, complaints, and recurring friction points in the current session.
2. When reviewing prior sessions from conversation logs or transcript files, scan user inputs, tool errors, repeated retries, long exploration sequences, and agent responses to reconstruct where execution drifted, failed, or wasted effort.
3. List the concrete mistakes, misunderstandings, missing preconditions, and context bottlenecks observed in those runs.

## 2. Diagnose the Instruction Gap

Classify why each recurring problem happened:

- **Missing context or unclear navigation**: Unclear documentation structure, missing architecture overviews, or poor discoverability forced excessive exploration to find entry points or contracts.
- **Missing rule or rationale**: The repository omitted an important constraint or the reason behind it, leaving agents to guess or apply guidance mechanically.
- **Wrong placement or duplication**: A repository-wide constraint sat inside an optional skill, a specialist workflow bloated root `AGENTS.md`, or the same rule was duplicated across multiple files and drifted out of sync.
- **Poor skill activation**: A skill's frontmatter `description` missed normal triggers in its domain or activated on unrelated work.
- **Stale or contradictory instructions**: File paths, commands, API endpoints, or conventions drifted from current code or `reviewed: true` documentation, or separate files gave conflicting guidance.
- **Tooling or environment ambiguity**: Environment setup, command invocation, database provisioning (`test:setup`), or build ordering was implicit, causing repeated trial-and-error failures.
- **Unaddressed model habit**: Coding agents repeatedly exhibited a predictable failure mode that human-oriented docs did not explicitly guard against.

## 3. Place Each Fix in the Right Layer

Update one owning layer per instruction instead of duplicating rules across files:

- **Repository-wide hard constraints and doc pointers**: Root `AGENTS.md`.
- **Package-local boundaries, invariants, and check commands**: The subproject's own `AGENTS.md`.
- **Task-scoped agent procedures and model-failure guardrails**: `.agents/skills/<name>/SKILL.md`.
- **Contributor-shared policies, standards, and system explanations**: Owning pages under `apps/docs/content/`.

## 4. Generalize in Plain Language

- Follow [How We Docs](../../../apps/docs/content/engineering/how-we-docs/index.md) and `.agents/skills/docs-authoring/SKILL.md` whenever editing documentation or written instructions.
- Derive the general principle behind the specific incident rather than adding special-case exceptions around one file or example.
- State both the rule and the reason briefly in plain, literal technical wording so agents apply it consistently across new cases.
- Omit redundant rules that restate instructions already linked from the target file.

## 5. Confirm Policy Changes and Verify

1. Ask maintainers before altering settled architecture principles, project direction, or repository-wide policies.
2. Whenever editing any existing page in `apps/docs/content/` marked `reviewed: true`, delete `reviewed: true` from its frontmatter so a maintainer reviews the diff.
3. Verify that all links and paths referenced across `AGENTS.md` and `.agents/skills/` exist on disk, run `env -u BIOME_CONFIG_PATH bunx --bun biome check --write` on touched instruction files, and run `bun run --cwd apps/docs types:check && bun run --cwd apps/docs build && bun run ci` if any file under `apps/docs/` changed.
