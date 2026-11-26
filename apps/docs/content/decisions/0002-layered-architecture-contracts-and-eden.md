---
title: "0002: 后端三层架构、共享 Zod 契约与 Eden 类型安全通信"
description: 确立 Handler -> Service -> Repository 分层边界、@cvsa/contracts 单一 Zod 契约源以及 @api-contract + Eden Treaty 零运行时泄露通信机制。
docType: explanation
---

*Recorded 2026-11-27.* CVSA 在后端服务（`apps/backend`、`apps/crawler`）、共享领域包（`packages/catalog`、`packages/authentication`）以及前端客户端（`apps/web`）之间统一采用 **`Handler -> Service -> Repository` 分层架构**、**`@cvsa/contracts` 单一 Zod 契约源**与 **仅类型导出的 `@api-contract` + Eden Treaty 客户端**。

## 背景与约束

CVSA 同时包含面向公众的 Web 站点（Astro SSR + SolidJS 浏览器端交互）、主 REST API（Elysia）以及运行在后台的爬虫控制面（Elysia）。如果各端各自维护请求/响应 TypeScript 接口、在 HTTP Handler 内混写数据库查询或直接将服务端路由对象导入前端代码，会迅速导致以下问题：

1. 前后端接口字段或错误码发生偏移，只能在集成运行后才暴露；
2. Elysia 默认常用的 TypeBox（`import { t } from "elysia"`）与领域层 Zod 校验并存会产生两套重复模型定义；
3. 前端一旦按值导入包含 Elysia 实例的后端文件，就会将 `@cvsa/db`、`Bun.SQL`、Pino 日志等服务端依赖卷入客户端打包产物。

## 决策内容

1. **严格三层职责分离**：
   - **Handler 层**（[apps/backend/src/handlers/](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/handlers)、[apps/crawler/src/controlPlane/](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/controlPlane)）：仅绑定路由、引用 `@cvsa/contracts` 中的 Zod Schema 做输入输出校验、构建 `Principal` 或透传请求头并调用 Service；禁止编写业务逻辑，也禁止在路由处理器内部使用 `try-catch` 吞掉异常。
   - **Service 层**（`packages/catalog`、`packages/authentication`、`apps/crawler/src/crawler`）：承载领域逻辑、CASL 权限判定与数据库事务编排，失败时直接抛出 [AppError](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/errors.ts)（携带跨模块标识 `APP_ERROR_MAGIC_NUMBER`），由全局 `errorHandler` 中间件统一捕获、注入 `X-Trace-ID` 并根据请求语言翻译错误消息。
   - **Repository 层**：封装 Drizzle ORM 或参数化 SQL 查询，并向 Service 暴露纯接口，以便单元测试使用内存 Store 替代真实数据库。
2. **共享 Zod 契约与类型禁用规则（`@cvsa/contracts`）**：
   - 所有接口入参、DTO、错误码枚举（`ErrorCodeEnum`）与运行时配置 Schema 均以 Zod 声明在 [packages/contracts/src/](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src)，并通过 `z.infer<typeof Schema>` 导出 TypeScript 类型。
   - 第一方代码全面禁止使用 Elysia TypeBox `t`、`any`、`z.any()`、`as SomeType` 类型断言以及 `@ts-ignore` / `@ts-expect-error`。
3. **仅类型 API 契约与 Eden Treaty 消费**：
   - 后端通过 [apps/backend/src/apiContract.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/apiContract.ts) 仅导出 `export type { App } from "./index"`。
   - 前端 [apps/web/src/lib/api/treaty.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/lib/api/treaty.ts) 通过 `import type { App } from "@api-contract"` 构造 `treaty<App>(...)`，配合 `verbatimModuleSyntax` 保证编译阶段彻底拦截任何按值导入；并统一用 `settle()` 将 Eden 响应标准化为携带 `traceId` 的 `ApiResult` 结构。

## 备选方案与取舍

- **备选方案一：生成 OpenAPI JSON 再用 codegen 生成前端 SDK**。需要额外的构建生成步骤，分支切换或改动接口后容易出现生成产物未同步提交的摩擦；`treaty<App>` 直接利用 TypeScript 类型系统实现零代码生成的端到端推导。
- **备选方案二：在 Elysia 路由中使用 TypeBox 定义输入输出、在域包中使用 Zod**。虽能贴合 Elysia 原生示例，但同一张请求体需维护两份 Schema；统一使用 Zod（配合 Elysia 对 Standard Schema / Zod 的支持）消除了契约分裂。
- **代价**：`App` 类型体量随路由增加而增长，需保持 `apps/backend` 路由显式声明响应 Schema 与返回类型，避免 TypeScript 类型推断退化拖慢 IDE 与 `typecheck`。

## 影响与后续约束

- 任何新后端接口必须先在 `packages/contracts` 落盘 Zod Schema，再挂载到 Elysia Handler；现有遗留未声明响应 DTO 的路由（如 `songSearchHandler`）需逐步补齐。
- 涉及跨服务或前端 API 变更时，必须执行全仓 `bun run typecheck` 验证 Eden Treaty 与契约兼容性。
