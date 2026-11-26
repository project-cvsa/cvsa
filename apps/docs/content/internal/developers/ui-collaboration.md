---
title: Human-in-the-loop GUI Collaboration
description: Division of responsibilities between coding agents and human reviewers for web interfaces.
---

Graphical user interfaces in `apps/web` and `apps/docs` are reviewed and verified directly by humans rather than automated agent checks. Coding agents implement layouts, wire state and API contracts, and run static checks, while human reviewers evaluate visual hierarchy, spacing, typography, and interactive feel.

## Why GUI quality requires human review

Coding agents can verify that TypeScript compiles, UnoCSS tokens resolve, and components render, yet they lack reliable visual and aesthetic judgment. Left to self-approve UI via headless browser captures, agents often introduce visual noise: unnecessary wrapper cards, decorative badges, awkward typography, crowded layouts, and redundant explanatory text. Separating code verification from visual review keeps both sides playing to their strengths.

## Division of responsibilities

- **Coding agents own implementation and non-visual verification**: Structure components using `@lib/cn`, `cva()`, and semantic design tokens, wire Eden Treaty `@api-contract` calls, write unit/contract tests, and run `bun run ci`, `bun run typecheck`, and `bun run test`. Agents do not start local dev servers or launch browsers to inspect UI unless explicitly requested by the user.
- **Human reviewers own visual inspection and interactive verification**: Open the running app or preview, operate controls across viewport sizes, and judge layout, alignment, and coherence with the surrounding tool.

When modifying an existing surface, follow existing component sizes, typography tokens (`ts-*`), spacing, and navigation patterns before introducing new top-level surfaces or controls.

## Making deep UI states reviewable

Important interface states—multi-step dialogs, empty states, loading transitions, error banners, and views tied to specific backend records—should remain easy to reach and inspect without brittle manual setup. Keep state transitions explicit and backed by realistic fixtures in tests or isolated previews so reviewers can inspect every variant cleanly.
