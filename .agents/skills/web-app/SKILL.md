---
name: web-app
description: Guide for building, structuring, styling, wiring `@lib/api` and `fanee` i18n, reusing UI primitives, and verifying `apps/web` features in CVSA. Activate when adding pages, SolidJS islands, UI components, API wrappers, or i18n copy in `apps/web`.
---

# Building `apps/web` Features

Follow one shared stack, design-token system, and human-in-the-loop GUI workflow across `apps/web`. See [Human-in-the-loop GUI Collaboration](../../../apps/docs/content/engineering/practices/ui-collaboration.md) for why visual review stays with human reviewers.

## 1. Stack and Directory Structure

`apps/web` combines Astro SSR (`@astrojs/node`) with SolidJS interactive islands (`@astrojs/solid-js`), UnoCSS (`uno.config.ts`), `@ark-ui/solid`, `lucide-solid`, and Vitest:

- `src/pages/`: Astro routes, SSR data loading, and page shells.
- `src/components/ui/`: Shared base primitives (`Button`, `Badge`, `Card`, `DataTable`, `DateField`, `DurationField`, `List`, `Menu`, `Modal`, `NumberField`, `Radio`, `Select`, `Slider`, `Switch`, `Table`, `Tabs`, `TagInput`, `TextArea`, `TextField`, `Toast`, `controlStyles.ts`).
- `src/components/layout/`, `src/components/typography/`, `src/components/icon/`, `src/components/pages/`: Layout shells, typography helpers, icons, and feature-specific page islands.
- `src/lib/api/`: Typed Eden Treaty client (`treaty.ts`, `result.ts`, and domain modules).
- `src/lib/i18n/`: Compile-time `fanee` SSR/client integration (`server.ts`, `client.ts`, `isomorphic.ts`, `namespaces.ts`).
- `src/lib/theme.ts` and `src/lib/cn.ts`: Semantic color tokens and token-aware class merging.

Reuse existing primitives in `src/components/ui/` and existing page patterns before introducing new components or top-level routes.

## 2. Typed API Wiring (`@lib/api` and `@api-contract`)

- **Add wrappers by domain**: Place endpoint wrappers in `src/lib/api/<module>.ts` and export them on `api` in `src/lib/api/index.ts`.
- **Never call raw `fetch`**: Components call `api.<module>.<action>(...)`, never `fetch` or `getEdenClient()` directly.
- **Keep `@api-contract` type-only**: `src/lib/api/treaty.ts` imports `import type { App } from "@api-contract"`. Because `verbatimModuleSyntax` is active, never turn this into a runtime import or add `@cvsa/backend` to `apps/web/package.json`.
- **Rely on shared transport behavior**: Do not pass `x-locale`, `accept-language`, or `credentials: "include"` per call—`treaty.ts` attaches them automatically and captures `x-trace-id`. Map `ApiResult` error codes to UI states instead of parsing raw response bodies.

## 3. Styling, Variants (`cva()`), and `cn()`

- **Class merging**: Always combine classes with `cn()` from `@lib/cn` (`tailwind-merge` extended with CVSA's `font-*`, `text-*` size/color scales, and `tracking-*` tokens). Never import `clsx` directly in components.
- **Variants and sizing**: Declare component variants with `cva()` + `VariantProps` from `class-variance-authority`, and pair interactive controls with `controlSizeClass` from `src/components/ui/controlStyles.ts`.
- **Design tokens only**: Use `ts-*` typography shortcuts (`ts-display-large` through `ts-overline`), `font-body`/`font-code`, and semantic color tokens from `src/lib/theme.ts` (`bg-surface`, `bg-hover`, `text-display`, `text-primary`, `text-secondary`, `text-error`, `border-border`, `bg-scrim`) instead of raw hex colors or ad-hoc font sizes. `tests/design-tokens.test.ts` enforces this rule automatically.
- **Restrained UI copy and hierarchy**: Keep visible text to clear utility labels, field names, statuses, and concise validation errors. Avoid marketing banners, decorative badges, redundant wrapper cards, internal database IDs, or punctuation clutter (`·`, `;`) in labels.

## 4. Compile-Time i18n (`fanee`)

- Translation bundles live under root `locale/` (`zh-CN` source locale) and are extracted statically per `fanee.config.ts`.
- In `.astro` files, use `i18nServer.getT` (`baseNamespace: "web"`).
- In SolidJS `.ts`/`.tsx` modules, use `getComponentT(namespace)` (`baseNamespace: "web:client"`) from `@lib/i18n/isomorphic` and ensure the owning `.astro` page includes the required namespaces from `src/lib/i18n/namespaces.ts`.
- After adding, changing, or removing translation keys, run `bun run i18n:check` (`fanee check --unused`) from root and keep `locale/` synced.

## 5. Verification and Human GUI Review

Agents run non-visual checks and never start dev servers or browsers to self-approve UI unless explicitly asked:

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
bun run ci
```

Follow `.agents/skills/testing/SKILL.md` for component, `@lib/api`, and contract tests (`tests/apiContract.test.ts`, `tests/design-tokens.test.ts`). Leave visual layout, spacing, and interactive feel to human reviewers.
