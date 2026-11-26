# Web Instructions (`apps/web`)

Owns Astro SSR pages (`src/pages/`), SolidJS interactive islands (`src/components/`), UnoCSS design tokens (`uno.config.ts`, `src/lib/theme.ts`), compile-time `fanee` i18n (`src/lib/i18n/`), and the typed API layer (`src/lib/api/`).

Follow [Human-in-the-loop GUI Collaboration](../../apps/docs/content/engineering/practices/ui-collaboration.md) and `.agents/skills/web-app/SKILL.md`.

## Boundaries & Invariants

- **Human-in-the-loop GUI**: Agents own component structure, state/API wiring, unit/contract tests, and static checks; humans review visual layout, spacing, and interactive feel. Do not start dev servers or browsers unless explicitly asked.
- **API client (`@lib/api`)**: Add wrappers in `src/lib/api/<module>.ts` and export them from `src/lib/api/index.ts`. Components call `api.<module>.<action>(...)`, never raw `fetch` or `getEdenClient()` directly.
- **Type-only contract**: `@api-contract` is a type-only path alias (`import type` only, enforced by `verbatimModuleSyntax`); never add `@cvsa/backend` as a package dependency. Do not pass `x-locale`, `accept-language`, or `credentials: "include"` per call—`src/lib/api/treaty.ts` injects them. Map `ApiResult` error codes to UI states instead of parsing raw response bodies.
- **Styling & design tokens**: Compose classes with `cn()` from `@lib/cn` (never import `clsx` directly), declare variants with `cva()` + `VariantProps`, and use `ts-*` typography shortcuts, `font-body`/`font-code`, and semantic colors (`bg-surface`, `text-primary`, `border-border`, `bg-scrim`). Enforced by `tests/design-tokens.test.ts`.
- **i18n (`fanee`)**: Use `i18nServer.getT` in `.astro` and `getComponentT(namespace)` in SolidJS components (configured in `fanee.config.ts`). Keep `locale/` synced and run `bun run i18n:check` from root.

## Verification

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
bun run ci
```
