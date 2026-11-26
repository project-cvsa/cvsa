---
title: 测试标准与策略
description: CVSA 自动化测试的验证范围、隔离原则、各子系统测试方法与统一执行顺序。
docType: reference
---

CVSA 的自动化测试用于守护外部可见行为、跨包契约与系统不变量，确保代码重构与功能迭代不会引发静默回归。

## 测试保护的核心属性

编写测试时，围绕重构后仍保持不变的外部行为与不变量展开：

- **公共契约**：HTTP 路由入参与响应 Schema（`@cvsa/contracts`）、`AppError` 错误码映射、序列化格式兼容与跨服务调用边界。
- **状态转换与领域不变量**：视频追踪状态机的合法迁移与防重入保护、邀请码防并发超额兑换、CASL 字段级权限拦截，以及中断恢复后的幂等行为。
- **数据层约束**：TimescaleDB 超表分块、压缩策略、扩展 Schema 隔离以及实时快照触发器行为。

## 确定性与环境隔离

- **面向公共接口而非内部实现**：通过公共 API、Service 方法、HTTP 路由或协议边界发起测试，断言返回值、持久化状态或发出事件，不 mock 私有方法或绑定内部调用细节。
- **零脆弱依赖**：不在测试中依赖不确定的真实毫秒级 `sleep` 竞争条件；时间推进通过显式参数或确定性时钟注入，每条用例保持自包含。
- **数据库与队列隔离**：测试运行时必须处于 `NODE_ENV=test`，由 `@cvsa/env` 路由至 `cvsa_test` 与 `cvsa_snapshot_test` 测试库，并使用独立的 BullMQ 队列前缀（`cvsa-test-<pid>`）。

## 各模块测试策略

| 模块 | 测试工具与范围 |
| :--- | :--- |
| `apps/backend` | 使用 Elysia Eden Treaty 针对测试库与 Redis 编写端到端（E2E）接口契约与鉴权集成测试。 |
| `packages/catalog`、`packages/authentication` | 使用内存仓储或测试数据库验证领域服务、CASL 能力判定与邀请码事务路径。 |
| `apps/crawler` | 使用内存 fake store（如 `InMemoryDiscoveryRepository`、`InMemoryTrackingRepository` 与 fake MQ）覆盖调度器、状态机、筛选流、网络适配器与统计流水线。 |
| `packages/snapshot-db` | 集成测试验证 TimescaleDB 超表、压缩策略、扩展隔离与 `latest_video_snapshot` 触发器。 |
| `apps/web` | 通过 Vitest 覆盖 `@lib/api` 契约封装、`design-tokens.test.ts` token 校验与前端交互逻辑；视觉布局交由人类评审（见 [人机协作 GUI 规范](./ui-collaboration.md)）。 |

## 统一执行顺序

推送分支或提交 Pull Request 前，在仓库根目录按顺序执行：

```bash
bun run ci
bun run typecheck
bun run test
```

## 相关文档

- [仓库布局](/zh/engineering/repository)：环境变量模板与测试数据库隔离规则。
- [人机协作 GUI 规范](./ui-collaboration.md)：自动化测试之外的界面视觉评审边界。
