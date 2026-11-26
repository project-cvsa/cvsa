---
title: 文档协作指南
description: 人类贡献者与 Coding Agent 共同维护 CVSA 工程知识库的分工、流程与质量约定。
docType: explanation
---

CVSA 的人类贡献者与 Coding Agent 在日常开发、排障与架构演进过程中共同维护项目文档。本组指南说明文档应当存放在仓库的哪一层、如何选择文档类型、遵循怎样的双语写作风格，以及如何通过 `apps/docs` 构建与静态校验。

## 文档维护的四个环节

### 1. 规划内容位置与文档类型

根据信息受众和变更频率，区分工程知识库（`apps/docs/content/`）、Agent 规则（`AGENTS.md` 与 `.agents/skills/`）和代码旁注释，并按读者目标选定唯一的 `docType`。请参阅 [信息架构与文档类型](./content-types.md)。

### 2. 遵循统一写作风格

保持直接、平实、不含官僚腔或内部行话的技术表达，规范中英文混排、标点断句、代码块、表格与 Fumadocs 链接格式。请参阅 [写作风格与排版规范](./style.md)。

### 3. 同步 Agent 上下文与审核边界

维护根目录 `AGENTS.md`、子项目 `AGENTS.md` 与按需触发的 `.agents/skills/`，遵守 `reviewed` 字段的人工复核约定，保证代码变更与文档事实一致。请参阅 [管理 Coding Agent 上下文](./context-for-agents.md)。

### 4. 本地生成与静态校验

在提交文档改动前运行 `fumadocs-mdx` 类型验证、静态构建以及 Biome 格式与规则校验，确认 frontmatter Schema、目录导航和站内链接全部有效。

## 非工程背景贡献者的参与方式

社区编目人员、词条贡献者或设计评审者无需掌握终端命令或 MDX 语法即可改进文档。关注重点在于业务边界、收录规则、界面术语或操作步骤是否准确：可以直接在 GitHub Issue 中指出过时描述，或提交纯文本草稿，由维护者或 Coding Agent 补全 frontmatter、调整格式并执行构建验证。
