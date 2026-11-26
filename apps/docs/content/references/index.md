---
title: 外部参考
description: CVSA 依赖的外部平台接口、数据库引擎、可观测性后端、搜索与模型运行时以及 CI/CD 部署机制参考。
docType: reference
---

*Recorded 2026-11-27.* 本节记录 CVSA 在实际运行与维护中已确认的外部接口语义、数据存储约束、遥测规范与交付机制，所有结论均对应仓库源码与运行配置。

- **[Bilibili 接口与网络调度](./bilibili-api.md)**：视频详情、搜索、推荐与批量统计接口的参数签名、浏览器请求头伪装、业务错误码与风控退避区分，以及 `@cvsa/network-scheduler` 的多适配器调度策略。
- **[TimescaleDB 与 Drizzle 运维边界](./timescaledb-and-drizzle.md)**：`video_snapshot` 超表与 `latest_video_snapshot` 触发器、`extensions` Schema 隔离与 `search_path`、长耗时 DDL 超时设置，以及 `push` 与 `migrate` 的适用范围。
- **[可观测性与 SigNoz 查询](./observability-and-signoz.md)**：`@cvsa/observability` OpenTelemetry 三信号导出、`@cvsa/logger` 脱敏与上下文注入、`x-trace-id` 链路透传，以及 `SigNozMetricsClient` 的 PromQL 查询规则。
- **[搜索同步、向量服务与 ONNX 分类](./search-and-embedding.md)**：PostgreSQL 到 Meilisearch 的事务性 Outbox 异步同步、`apps/embedding` 文本向量服务，以及 `apps/crawler` 中的隔离子进程 `akari` ONNX 分类流水线。
- **[CI/CD 与容器化部署](./ci-cd-and-deployment.md)**：`apps/deploy/src/plan.ts` 基于 Turbo `--affected` 的级联构建规划、多阶段 `Dockerfile` 依赖分层，以及宿主机 Webhook 部署守护进程的拉取与滚动更新流程。
