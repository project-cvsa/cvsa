# Documentation Rules (`apps/docs`)

Owns the Fumadocs + Next.js documentation site (`content/`, `app/`, `source.config.ts`, `lib/`), covering the user manual (`content/(manual)/`), engineering docs (`content/engineering/`), plans (`content/plans/`), architecture decisions (`content/decisions/`), external references (`content/references/`), and early ideas (`content/ideas/`).

Read [How We Docs](content/engineering/how-we-docs/index.md) and `.agents/skills/docs-authoring/SKILL.md` before adding or reorganizing pages.

## Boundaries & Invariants

- **Open-source engineering focus**: Write for external contributors and coding agents alike. Keep prose focused on architecture, plans, decisions, external references, and engineering workflows without corporate or internal-chat framing.
- **Frontmatter**: Keep frontmatter compatible with `source.config.ts` (`title`, optional `description`, `docType`, `status`). Include `Recorded YYYY-MM-DD` on time-sensitive plans, decisions, and references. Never add `reviewed: true`, and remove `reviewed: true` whenever editing a marked page.
- **Navigation & Fumadocs links**: Update the owning folder's `meta.json` whenever adding pages or sections. Use `./file.md` (including `.md`/`.mdx` extension) for same-folder relative links, root-relative `/zh/...` or `/en/...` for cross-section doc links, and GitHub `blob/main/...` URLs for source files outside `apps/docs/content/`.

## Verification

```bash
bun run --cwd apps/docs types:check
bun run --cwd apps/docs build
bun run ci
```
