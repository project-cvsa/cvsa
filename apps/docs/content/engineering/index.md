---
title: 工程知识库
description: CVSA 开源仓库的架构说明、系统规约、工程实践、文档协作指南以及计划与决策索引。
docType: explanation
---

CVSA（Chinese Vocal Synthesizer Archive，中 V 档案馆）是一个面向中文电子歌声合成曲目的开源档案平台与数据追踪系统。本工程知识库面向所有开源贡献者与 Coding Agent，集中记录仓库结构、系统规约、工程实践与文档协作方式，避免关键约束与设计依据散落在对话记录或个人记忆中。

## 代码与仓库结构

CVSA 采用 Bun 与 Turborepo 组织的单一代码仓库（Monorepo），将可部署服务置于 `apps/`，将领域逻辑、数据库契约与共享基础设施置于 `packages/`。各包通过 workspace 协议共享类型与契约，同时保持后端服务、爬虫守护进程、推理服务与 Web 应用的运行隔离。

请参阅 [仓库布局](./repository.md) 了解顶层目录分工与本地环境变量隔离规则，参阅 [开发者指南](./guide.md) 了解本地依赖拉起与常用开发命令，或参阅 [系统架构](./architecture.md) 了解分层调用关系与部署拓扑。

## 系统规约与跨包契约

当多个服务或共享包依赖同一套接口、数据流或权限模型时，对应规约集中在 [系统规约](./specs/index.md)：

- **接口与共享契约**：后端 `/v2` 路由、爬虫控制面、`@cvsa/contracts` Zod Schema 与统一错误体系。
- **爬虫发现、策展与追踪**：候选视频筛选、双层标注策展、时序快照状态机与里程碑回溯。
- **认证与权限模型**：邀请制注册、会话鉴权以及基于 CASL 的字段级权限控制。

## 工程实践与文档协作

日常编码、测试与人机界面协作约定维护在 [工程实践](./practices/index.md)，包括 [测试标准](./practices/testing.md)、[人机协作 GUI 规范](./practices/ui-collaboration.md)、[代码风格指南](./practices/style-guide.md) 与 [分支与 PR 工作流](./practices/workflow.md)。

关于如何组织文档目录、选择文档类型、遵循双语写作风格以及维护 Agent 上下文，请参阅 [文档协作指南](./how-we-docs/index.md)。

## 路线图、决策、参考与归档

独立于日常工程手册的时间敏感记录与外部约束放在各自顶层分区，方便直接追踪与演进：

- [开发进度与路线图](/zh/plans)：记录各子系统当前落地状态与后续演进方向。
- [架构决策记录 (ADR)](/zh/decisions)：记录跨模块边界与数据结构的关键决策及其权衡依据。
- [外部技术参考](/zh/references)：汇总 Bilibili 接口行为、TimescaleDB 运维边界、观测链路与部署规划细节。
- [想法与备忘](/zh/ideas)：存放尚处于探索阶段的早期设想与技术笔记。
- [历史归档](./legacy/index.md)：早期概要设计与旧版爬虫文档留档（均已标记为废弃，仅作背景参考）。
