---
title: 信息架构与文档类型
description: CVSA 仓库中知识分层、Fumadocs 目录结构、五类 docType 模板、生命周期状态与链接规则。
docType: reference
---

CVSA 文档按职能分区组织，并通过 `apps/docs/source.config.ts` 中定义的 `docType`、`status` 与 `reviewed` frontmatter 字段标识每篇文档的结构预期与维护状态。

## 知识存放边界

仓库内的工程与协作信息按受众和变化频率分布在三个位置，避免同一份事实在多处重复维护：

- **项目文档站 (`apps/docs/content/`)**：面向开源贡献者与 Coding Agent 的耐用技术知识，涵盖用户手册（`(manual)/`）、工程指南与系统规约（`engineering/`）、开发路线图（`plans/`）、架构决策（`decisions/`）、外部参考（`references/`）与早期想法（`ideas/`）。站点同时输出 `/llms.txt` 与 `/llms-full.txt` 供工具消费。
- **Agent 指令 (`AGENTS.md` 与 `.agents/skills/`)**：根目录 `AGENTS.md` 保持精简，仅放全局不变量与路由指针；子项目 `AGENTS.md` 放置局部模块约束；`.agents/skills/` 存放按任务触发的操作工作流与常见失误防护。详情见 [管理 Coding Agent 上下文](./context-for-agents.md)。
- **代码与配置旁注释**：贴近源码的局部实现细节与非显而易见的设计原因，随源码同步演进。

## 站点目录组织

`apps/docs/content/` 下的顶层分区通过 `meta.json` 中的 `"root": true` 划分独立导航根：

| 目录 | 导航根与路由前缀 | 承载内容 |
| :--- | :--- | :--- |
| `(manual)/` | `/zh`、`/en` | 面向档案馆最终用户与编目编辑者的项目介绍、收录范围等用户手册。 |
| `engineering/` | `/zh/engineering` | 仓库布局、开发指南、系统架构、文档协作规范、工程实践、跨包规约及历史归档。 |
| `plans/` | `/zh/plans` | 当前已落地进度与后续多阶段规划，区分现状与规划方向。 |
| `decisions/` | `/zh/decisions` | 编号架构决策记录（`0001-...`），沉淀难以逆转的设计取舍。 |
| `references/` | `/zh/references` | 外部平台接口、数据库引擎、观测工具与部署流水线约束。 |
| `ideas/` | `/zh/ideas` | 尚在探索中的早期想法与备忘笔记，不构成既定规约。 |

每个顶层分区与多页面子目录均包含一个 `meta.json`（声明导航标题与页面顺序）和一个 `index.md` 概览页。`index.md` 应简洁说明该目录的覆盖范围和入口链接，避免堆砌易变的细节或重复子页面全文。

## 五种文档类型 (`docType`)

在 [`apps/docs/source.config.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/docs/source.config.ts) 中，`docType` 为可选枚举字段，取值对应五类明确结构：

| `docType` | 适用场景 | 建议结构 |
| :--- | :--- | :--- |
| `tutorial` | 带领初次接触项目的读者沿单一路径跑通一个具体结果。 | 前置条件、按顺序编号的步骤、每步后的预期结果确认。 |
| `how-to` | 帮助已有基础的开发者完成具体任务（如搭建环境、发起 PR、同步上下文）。 | 简短背景、前置条件、分步命令与完成验证方式。 |
| `reference` | 供开发过程中快速查阅的客观事实（目录表、Schema、接口字段、风格规则）。 | 范围说明，配合结构化表格、字段定义与不变量清单。 |
| `explanation` | 阐明系统为何如此设计、各模块如何交互或某项技术取舍的利弊。 | 背景约束、运行机制、替代方案对比与权衡结论。 |
| `plan` | 同步某一子系统或方向的现状与后续路线图。 | 明确分隔「当前已落地状态」与「后续演进方向」，列出待决设计问题。 |

### 相似类型的判断标准

- **Plan 与 Decision 的区分**：尚在推进中的多步方案或未来工作属于 `plans/`（`docType: plan`，`status: planned` 或 `draft`）；已经拍板并约束现有代码边界的长期选择，记录在 `decisions/`（`docType: explanation`）。
- **Reference 与 Explanation 的区分**：需要精确查询字段、路径、命令与规则时写 `reference`；需要解释因果链条与替代方案取舍时写 `explanation`。

## 生命周期状态与复核标记

`apps/docs/source.config.ts` 同时支持以下可选生命周期字段：

- **`status`（`"draft" | "planned" | "deprecated"`）**：标识文档当前所处阶段。`draft` 表示仍在完善中的草案；`planned` 表示尚待实施的规划；`deprecated` 表示已被新文档替代的归档页面，必须在页面顶部注明替代页面链接。
- **`reviewed`（`boolean`）**：用于区分未经人工复核的 Agent 产出内容与经过维护者逐字确认的权威页面。Agent 创建或修改任何文档时都不得添加 `reviewed: true`；修改已有 `reviewed: true` 标记的页面时，必须一并移除该字段，等待人工复核后再由维护者重新标注。

## Fumadocs 站内与源码链接规则

`apps/docs/app/(docs)/[lang]/[[...slug]]/page.tsx` 使用 Fumadocs 的 `createRelativeLink(source, page)` 解析 Markdown 链接，其底层 `source.resolveHref` 仅对 `./` 开头的相对路径执行文件映射，不会解析 `../` 相对路径。编写链接时必须遵守以下约定：

- **同目录或子目录页面**：使用以 `./` 开头并带完整扩展名的相对路径，例如 `./repository.md` 或 `./specs/api-and-contracts.md`。
- **父目录或跨顶层分区页面**：使用以语言前缀开头的站内根相对路径，例如 `/zh/engineering/architecture`、`/zh/plans`、`/zh/decisions/0001-dual-database-postgres-and-timescaledb`。
- **文档目录之外的仓库源码与配置文件**：使用完整 GitHub `blob/main` 链接（例如 `https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/errors.ts`），不要指向文档目录外的相对文件系统路径。
