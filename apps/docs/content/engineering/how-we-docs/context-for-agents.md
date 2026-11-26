---
title: 管理 Coding Agent 上下文
description: 保持知识库、AGENTS.md 与 .agents/skills/ 同步，以及执行 Agent 文档复核与构建验证的操作步骤。
docType: how-to
---

在日常开发或重构修改了系统行为、目录结构或命令入口时，按以下约定同步维护知识库页面、Agent 路由指令与技能文档，避免新会话依赖过时信息。

## 保持单一事实来源

仓库为人类与 Agent 分别提供不同粒度的上下文入口：

1. **知识库页面（`apps/docs/content/`）**：存放完整架构、跨包规约、路线图、ADR 与外部技术约束。
2. **全局与子项目指令（`AGENTS.md`）**：根目录 [`AGENTS.md`](https://github.com/project-cvsa/cvsa/blob/main/AGENTS.md) 仅保留全仓不变量与路由链接；子项目 [`apps/backend/AGENTS.md`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/AGENTS.md)、[`apps/web/AGENTS.md`](https://github.com/project-cvsa/cvsa/blob/main/apps/web/AGENTS.md) 与 [`apps/docs/AGENTS.md`](https://github.com/project-cvsa/cvsa/blob/main/apps/docs/AGENTS.md) 记录各端局部约束。
3. **按需技能包（`.agents/skills/`）**：[`jujutsu-vcs`](https://github.com/project-cvsa/cvsa/blob/main/.agents/skills/jujutsu-vcs/SKILL.md) 与 [`github-pr-workflow`](https://github.com/project-cvsa/cvsa/blob/main/.agents/skills/github-pr-workflow/SKILL.md) 封装按场景触发的 VCS 与 PR 操作步骤，不把冗长的 CLI 手册塞进全局 `AGENTS.md`。

## 同步更新文档的权限边界

根据改动性质决定是否可以直接就地更新：

1. **可直接就地更新的内容**：经源码或运行输出确认的实现事实、变更后的目录路径或 CLI 命令、模块当前落地状态、已证实的外部接口约束。
2. **需先向维护者确认的内容**：修改既定架构原则、调整路线图方向、改动跨包核心规约，以及新增或废弃 `decisions/` 中的架构决策记录。
3. **日期与依据记录**：在 `plans/`、`decisions/`、`references/` 与 `ideas/` 中记录时间敏感结论时，写明 `Recorded YYYY-MM-DD`、当时面临的约束以及被排除的备选方案。

## 遵守 `reviewed` 复核规则

为防止未验证的推断混入既定标准，Agent 编辑文档时必须遵守两条硬性约束：

1. 新建页面或编辑页面时，**禁止添加 `reviewed: true`**。
2. 编辑任何已带有 `reviewed: true` 的页面时，**必须从 frontmatter 中删除该字段**，使改动在后续人工评审中可见。

## 验证文档与链接有效性

在完成文档增删、目录迁移或 frontmatter 调整后，在仓库根目录依次执行以下命令确认类型、编译与格式无误：

```bash
bun run --cwd apps/docs types:check
bun run --cwd apps/docs build
env -u BIOME_CONFIG_PATH bunx --bun biome check --write apps/docs/source.config.ts apps/docs/content/
```

如果修改涉及顶层导航或页面移动，还需同时确认根目录 `AGENTS.md`、子项目 `AGENTS.md` 与 `.agents/skills/` 中的文档路径链接均指向有效位置。

## 相关文档

- [信息架构与文档类型](./content-types.md)：frontmatter 字段定义与 Fumadocs 链接语法。
- [写作风格与排版规范](./style.md)：双语写作语气、标点与代码块格式规则。
