---
title: Docs as Knowledgebase
description: How CVSA keeps durable engineering knowledge, active plans, and agent context synchronized.
---

CVSA treats `apps/docs/content/internal/` as the single durable knowledgebase shared by teammates and coding agents. Rather than leaving architectural decisions, constraints, and roadmaps buried in chat threads, keep them in the owning domain document.

## Put each kind of information in one place

- **Internal documentation (`apps/docs/content/internal/`)**: Durable architecture, specifications, active plans, decision records, and engineering practices.
- **Agent instructions (`AGENTS.md` and `.agents/skills/`)**: Always-loaded repository rules in `AGENTS.md` and task-scoped procedures in `.agents/skills/` that link to canonical docs rather than duplicating them.
- **Code and configuration comments**: Local implementation details kept beside the code so they stay current as code changes.

## Keeping documentation current

When implementation, debugging, or review changes external behavior, interfaces, commands, directory layout, or uncovers durable constraints or disproven assumptions, update the affected doc in place instead of spawning fragmented notes:

- **Autonomous updates**: Confirmed implementation facts, updated file paths or CLI commands, current module status, and objective findings.
- **Requires human confirmation**: Altering settled architecture principles, product direction, technical specifications, roadmaps, or creating/deprecating decision records.
- **Review discipline (`reviewed`)**: Agents must never add `reviewed: true` to a page. Whenever an agent edits an existing page marked `reviewed: true`, it must remove `reviewed: true` from frontmatter so a human reviews the diff.

## Updating, planning, and deprecating

- **Edit in place**: Extend or correct the existing topic page for the same audience.
- **Keep active plans visible**: Store multi-step proposals and roadmaps in `apps/docs/content/internal/` with clearly separated **Current state** and **Planned direction** sections.
- **Deprecate cleanly**: When a workflow or plan is superseded, mark the old page deprecated with a link to its replacement, or remove it once unreferenced.
