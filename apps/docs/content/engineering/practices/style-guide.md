---
title: 代码风格指南
description: CVSA 项目的 TypeScript 类型安全红线、Zod 校验、Drizzle 规范与前端工程约定。
docType: reference
---

本指南汇总 CVSA 全仓强制执行的代码风格与工程约束，与 Biome 配置和根目录 `AGENTS.md` 中的技术不变量保持一致。

## TypeScript 与类型安全

- **命名约定**：类、接口、类型定义与类文件使用 `PascalCase`（如 `UserService.ts`）；普通函数、变量与模块文件使用 `camelCase`（如 `authHandler.ts`）；全局常量使用 `UPPER_SNAKE_CASE`。
- **类型安全红线**：
  - 禁止使用 `any` 与内联类型断言 `as SomeType`；
  - 禁止在第一方代码中使用 `@ts-ignore` 与 `@ts-expect-error`；
  - 禁止在业务文件内重复手写局部接口定义，统一从 `@cvsa/contracts`（`z.infer<typeof Schema>`）、`@cvsa/db` 或 `@cvsa/snapshot-db` 导入。
- **边界信任与可维护性**：在 HTTP 与 CLI 入口使用 Zod 严格校验外部输入，进入领域层后直接信任 TypeScript 类型流，不编写冗余空值兜底分支或无意义分割线注释。重复逻辑应提炼为共享辅助函数或数据驱动映射。

## 后端、校验与错误处理

- 所有请求与响应 Schema 收敛到 `packages/contracts`，禁止使用 Elysia TypeBox（`import { t } from "elysia"`）或 `z.any()`。
- `apps/backend` 与 `apps/crawler` 控制面路由统一挂载在 `/v2` 前缀下，遵循 RESTful 资源名词约定，不在路径中出现动作动词。
- 业务异常统一从 Service 层抛出 `AppError`，禁止在 Elysia Handler 中编写业务逻辑或用 `try-catch` 吞掉异常。

## 数据库规范 (Drizzle ORM)

- **Schema 划分**：主库按业务划分 `core`、`meta`、`platform`、`auth` 四个 PostgreSQL Schema；时序与发现数据位于 `@cvsa/snapshot-db`。
- **版本化迁移**：持久化结构变更必须生成版本化 Drizzle 迁移脚本，生产环境由容器启动入口执行迁移，不以 `drizzle-kit push` 替代迁移历史。`drizzle-kit push` 仅用于测试库初始化或本地原型阶段，TimescaleDB 超表、压缩策略与触发器由 [`ensure-timescale.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) 幂等维护。
- **环境变量读取**：统一从 `@cvsa/env` 读取强类型环境变量，不手写 `.env` 文件解析逻辑。

## 前端工程 (`apps/web`)

- 所有后端请求统一通过 `@lib/api` 封装的 Eden Treaty 客户端发起，禁止在组件中直接调用 `fetch` 或引入 `@cvsa/backend` 运行时依赖（仅通过 `@api-contract` 执行 `import type`）。
- `@lib/api` 客户端自动处理 `x-locale`、`accept-language` 与 `credentials: "include"`，组件只需将 `ApiResult` 错误码映射为界面提示。
- 样式类组合统一使用 `@lib/cn` 的 `cn()`，组件变体使用 `cva()` + `VariantProps`，排版与颜色采用 `apps/web/uno.config.ts` 中定义的 `ts-*` 与语义化颜色 token。
- 多语言文案通过 `@fanee/*` 编译期提取，新增或修改词条后运行 `bun run i18n:check` 确认无未消费词条。

## 静态校验命令

在根目录执行以下全仓校验：

```bash
bun run ci
bun run typecheck
```
