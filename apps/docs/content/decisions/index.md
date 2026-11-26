---
title: 架构决策记录 (ADR)
description: 记录 CVSA 中跨越模块边界、改变数据模型或难以逆转的工程架构决策。
docType: explanation
---

*Updated 2026-11-27.* 本目录保存对仓库边界、运行时约定或数据模型产生长期约束的技术决策。每份决策记录明确给出当时面对的约束背景、最终方案、被否决的备选路径与取舍，以及对后续开发的影响。

已接受的决策记录保持不可变。如果后续演进推翻了某项早期决策，应新增一份更高编号的 ADR 声明替代关系，并将旧文档标记为 `status: deprecated`，而不是直接改写历史结论。

## 决策目录

- **[0001：编目主库 (PostgreSQL) 与时序追踪库 (TimescaleDB) 双库隔离](./0001-dual-database-postgres-and-timescaledb.md)**
- **[0002：后端三层架构、共享 Zod 契约与 Eden 类型安全通信](./0002-layered-architecture-contracts-and-eden.md)**
- **[0003：Better Auth 兼容存储、CASL 字段策略与邀请码事务准入](./0003-auth-casl-and-invitation-onboarding.md)**
- **[0004：基于 fanee 的编译期国际化与域名语言路由](./0004-compile-time-i18n-with-fanee.md)**
- **[0005：双层视频标注策展模型与淘汰样本元数据留存](./0005-dual-layer-annotation-curation.md)**
- **[0006：发现与调度开关收敛至运行时执行配置](./0006-runtime-discovery-feature-flags.md)**
