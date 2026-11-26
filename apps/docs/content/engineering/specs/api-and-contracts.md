---
title: 接口与共享契约规约
description: apps/backend 与 apps/crawler 的 HTTP /v2 路由组织、@cvsa/contracts Schema 分布、Eden Treaty 边界与统一错误格式。
docType: reference
---

CVSA 所有服务间通信与前端接口调用均以 `@cvsa/contracts`（`packages/contracts`）中的 Zod Schema 作为唯一结构定义，并通过 Elysia 全局错误处理与 `X-Trace-ID` 头部保持统一的错误格式与链路追踪。

## HTTP 路由组织与跨服务边界

### 主后端 (`apps/backend`)

[`apps/backend/src/index.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/index.ts) 将根 Elysia 实例挂载于 `/v2` 前缀下，提供健康端点 `/v2/health`（返回 `{ status: "ok", version }`）以及以下业务处理器：

| 处理器 | 负责域 |
| :--- | :--- |
| `authHandler` | 登录、登出、邀请码注册与当前用户信息（`/v2/session`、`/v2/user`、`/v2/me`）。 |
| `songHandler` | 曲目详情、创建、更新、删除、搜索、歌词及外部链接管理。 |
| `engineHandler`、`artistHandler`、`artistRoleHandler`、`singerHandler` | 合成引擎、创作者、创作角色与虚拟歌手的编目读写。 |
| `crawlerAdminHandler` | 挂载于 `/v2/admin/crawler`，经 `adminAuthMiddleware` 鉴权后将请求代理至爬虫控制面。 |
| `invitationAdminHandler` | 挂载于 `/v2/admin/invitations`，供 `OWNER` 与 `admin` 管理注册邀请码。 |
| `devHandler` | 开发调试辅助接口。 |

CORS 策略默认允许 `*.projectcvsa.com`、`localhost`、`127.0.0.1` 以及通过环境变量 `WEB_ORIGINS` / `SITE_ADDRESS` 配置的域名，允许请求头 `content-type`、`x-locale`、`authorization`、`accept-language`，并暴露响应头 `x-trace-id` / `X-Trace-ID`。

### 爬虫控制面 (`apps/crawler`)

[`apps/crawler/src/controlPlane/index.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/controlPlane/index.ts) 同样使用 `/v2` 前缀，所有路由统一通过 `onBeforeHandle` 校验 `Authorization: Bearer <CONTROL_API_TOKEN>`：

- `/v2/network-runtime`：读取与替换网络运行时配置（含 `revision` 并发版本控制）、查询适配器冷却与会话状态、探测单个网络适配器。
- `/v2/tracking`：手动摄入视频（`/ingest`）、批量注册追踪、分页筛选与排序追踪列表、单视频历史快照查询、手动触发快照与提权至里程碑追踪。
- `/v2/discovery`：查询发现队列状态、获取/更新筛选配置、触发搜索巡检或热榜采样、浏览推荐关联图、双层标注策展、元数据补齐与训练集导出。
- `/v2/stats`：运行总览指标查询、BullMQ 队列任务列表/详情查询及任务重试或删除。
- `/v2/milestones`：里程碑记录导入与查询、历史里程碑恢复作业、调度回测与 Bilibili 缓存窗口周期分析。

### 前后端类型契约 (`@api-contract`)

[`apps/backend/src/apiContract.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/apiContract.ts) 仅导出 `export type { App } from "./index"`。`apps/web` 通过 `@api-contract` 路径别名结合 `@elysiajs/eden` 推导全量接口入参、查询参数与返回类型，运行时不会打包任何后端代码。

## `packages/contracts` 模块划分

| 源码文件 | 覆盖契约 |
| :--- | :--- |
| [`errors.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/errors.ts) | `AppError`、`APP_ERROR_MAGIC_NUMBER`、`ErrorCodeEnum` 与 `ErrorResponseSchema`。 |
| [`song.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/song.ts) | `SongTypeSchema`、`PlatformSchema`、曲目增改查、歌词与外链 DTO。 |
| [`catalog.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/catalog.ts) | 创作者、歌手、创作角色与合成引擎 CRUD Schema。 |
| [`invitation.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/invitation.ts) | 邀请码创建、列表与返回 DTO。 |
| [`crawler.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler.ts) | 发现上下文、网络运行时配置、`CrawlerExecutionConfigSchema`、标注策展与队列作业契约。 |
| [`crawler/policies.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler/policies.ts) | 追踪策略、重试策略与 `DEFAULT_TRACKING_POLICY` 默认分档参数。 |
| [`crawler/milestone.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler/milestone.ts) | 里程碑导入、恢复任务、回测与缓存窗口分析 Schema。 |
| [`crawler/operations.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler/operations.ts) | 周期任务计划、Worker 并发配额与吞吐指标 Schema。 |
| [`crawlerStats.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawlerStats.ts) | 控制面概览统计报表 DTO。 |
| [`embedding.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/embedding.ts)、[`deploy.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/deploy.ts)、[`akariWorker.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/akariWorker.ts)、[`i18n.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/i18n.ts) | 向量服务、部署规划、分类推理子进程与局部多语言结构契约。 |

## 统一错误模型与链路追踪

领域 Service 抛出 `AppError(message, code, statusCode, meta)`，`AppError.isAppError` 通过魔数 `APP_ERROR_MAGIC_NUMBER` 识别跨包实例。[`apps/backend/src/errorHandler.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/errorHandler.ts) 统一拦截异常并输出符合 `ErrorResponseSchema` 的响应：

- **状态码映射**：`AppError` 保留自身 `statusCode`；路由未匹配返回 `404`（`NOT_FOUND`）；Elysia Schema 校验失败返回 `422`（`VALIDATION_ERROR`）；未预期异常记录详细错误日志并返回 `500`（`INTERNAL_SERVER_ERROR`）。
- **Trace ID 关联**：优先读取当前 OpenTelemetry 活动 Span 的 Trace ID，在无导出器或测试环境下自动生成请求级 32 位十六进制 ID，并同时写入响应头 `X-Trace-ID` 与错误日志上下文。
- **核心错误码枚举 (`ErrorCodeEnum`)**：包含 `NOT_FOUND`、`VALIDATION_ERROR`、`ENTITY_CONFLICT`、`INVALID_CREDENTIALS`、`AUTH_ERROR`、`INTERNAL_SERVER_ERROR`、`USERNAME_IS_ALREADY_TAKEN`、`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`、`INVALID_EMAIL_OR_PASSWORD`、`USER_NOT_FOUND`、`EMAIL_NOT_VERIFIED`、`UNAUTHORIZED`、`FORBIDDEN`、`CRAWLER_UNAVAILABLE`、`CRAWLER_REQUEST_FAILED`、`CRAWLER_RATE_LIMITED`、`INVITE_CODE_REQUIRED`、`INVALID_INVITE_CODE`、`INVITE_CODE_EXPIRED`、`INVITE_CODE_EXHAUSTED`、`ROLE_NOT_FOUND`。
