---
title: 分支与 PR 工作流
description: 基于 main 的分支命名、Jujutsu (jj) 日常操作、Conventional Commits 与 Pull Request 格式规范。
docType: how-to
---

CVSA 所有代码与文档改动都通过面向 `main` 分支的 Pull Request 合并，并由维护者以 Squash & Merge 方式合入。

## 分支与 Jujutsu 工作流

1. **从 `main` 切出工作分支**：所有功能开发与问题修复均以 `main` 为基准，禁止直接向 `main` 推送提交。
2. **分支命名格式**：采用 `<type>/<developerName>-<issueID>-<name>`（无关联 Issue 时可省略编号），例如 `fix/jack-132-song-api` 或 `feat/alikia-crawler-invitation-deploy`。
3. **优先使用 Jujutsu (`jj`)**：日常变更隔离、拆分与推送优先使用 `jj`（参考 [`.agents/skills/jujutsu-vcs/SKILL.md`](https://github.com/project-cvsa/cvsa/blob/main/.agents/skills/jujutsu-vcs/SKILL.md)），执行命令时始终附带 `--no-pager` 参数，不在已有脏工作树中混入无关修改（先运行 `jj --no-pager new`）。

## 提交信息 (Conventional Commits)

提交标题与 PR 标题统一遵循 Conventional Commits 格式：

```text
<type>(<optional-scope>): <description>
```

- **允许的 `type`**：`feat`、`fix`、`update`、`docs`、`style`、`refactor`、`perf`、`test`、`ci`、`chore`、`revert`。
- **长度与范围**：标题不超过 **72 个字符**，使用单一或精简 scope，避免长串逗号分隔列表；描述聚焦具体变更，结尾不加句号。

## Pull Request 与合并前验证

在发起或更新 PR 前，先在本地按顺序完成全部验证：

```bash
bun run ci
bun run typecheck
bun run test
```

注意仅运行 `bun run lint` 不足以通过 GitHub CI，因为 `bun run ci` 同时包含 Biome 格式验证（`biome ci .`）与多语言词条校验（`fanee check --unused`）。

编写 PR 描述时遵循以下要求：

1. **PR 标题**：符合 Conventional Commits 格式且不超过 72 个字符，直接对应合入 `main` 后的提交标题。
2. **PR 正文**：必须包含 `## Changes` 与 `## Related` 章节（可附 `## Summary`），如实列出变更内容与关联 Issue/PR，不写入内部 JJ Change ID 或空洞套话。
3. **提供 Squash & Merge 文本**：当由 Coding Agent 准备或更新 PR 时，需在回复中直接给出可直接用于 GitHub **Squash & Merge** 的标题（包含 `(#PR)` 后仍不超过 72 个字符）和提交正文。
