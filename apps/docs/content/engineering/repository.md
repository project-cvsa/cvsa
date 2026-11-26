---
title: 仓库布局
description: CVSA Monorepo 的顶层目录分工、应用与共享包职责以及本地环境变量与测试库隔离约定。
docType: reference
---

CVSA 采用 Bun Workspaces 与 Turborepo 管理所有可部署服务与共享领域包。顶层配置文件（`package.json`、`turbo.json`、`biome.json`、`fanee.config.ts`、`docker-compose.yml` 与 `Dockerfile`）统一协调全仓的构建、类型验证、测试与本地容器编排。

## 顶层目录结构

下表列出仓库根目录下的主要目录及其职责分工。

| 目录 | 用途 |
| :--- | :--- |
| `apps/` | 可独立部署或运行的应用服务（Web、后端 API、爬虫、嵌入推理、部署编排与文档站）。 |
| `packages/` | 被多个应用复用的共享库，涵盖数据契约、数据库 Schema、编目逻辑、权限、网络调度与观测封装。 |
| `docker/` | 生产与开发部署相关的辅助容器配置。 |
| `locale/` | 由 `@fanee/tools` 管理的编译期多语言翻译词条目录。 |
| `model/` | 爬虫分类模型（`akari` ONNX）与嵌入模型权重目录，不纳入常规代码构建。 |
| `scripts/` | 仓库辅助脚本。 |
| `.agents/` | 仓库级 Agent 技能包（`skills/jujutsu-vcs/` 与 `skills/github-pr-workflow/`）。 |
| `.github/` | GitHub Actions CI、文档站部署（Cloudflare Pages）与增量镜像发布工作流。 |

## 应用服务 (`apps/`)

每个应用位于 `apps/` 下的独立目录，声明各自的运行脚本与工作区依赖。

| 目录 | 运行框架与核心职责 |
| :--- | :--- |
| `apps/backend` | 主后端 REST API（Elysia，前缀 `/v2`），提供编目读写、认证会话、邀请码管理、爬虫代理控制面，以及基于 BullMQ 的 search outbox 同步工人。 |
| `apps/crawler` | Bilibili 视频发现、时序快照采集与里程碑追踪守护进程（Elysia 控制面 `/v2` + BullMQ），内含受控子进程运行的 ONNX `akari` 歌曲分类器与 SigNoz 指标客户端。 |
| `apps/web` | 前台浏览与管理控制台（Astro SSR + SolidJS + UnoCSS + `@fanee/*`），通过只读类型路径别名 `@api-contract` 与 Eden Treaty 客户端调用主后端。 |
| `apps/embedding` | 独立的向量嵌入 HTTP 推理服务，为 Meilisearch 混合搜索提供文本向量计算。 |
| `apps/deploy` | 宿主机部署编排守护进程与 CI 变更影响面规划器（`src/plan.ts`），按受影响包计算需要重建的服务镜像。 |
| `apps/docs` | 项目用户手册与工程知识库站点（Next.js + Fumadocs），输出静态站点与 `/llms.txt`。 |

## 共享包 (`packages/`)

共享包通过 `workspace:*` 协议被上层应用引用，各包职责保持正交。

| 包目录 | 包名 | 职责说明 |
| :--- | :--- | :--- |
| `packages/contracts` | `@cvsa/contracts` | 跨服务共享的 Zod Schema、DTO 类型导出（`z.infer`）、`AppError` 与 `ErrorCodeEnum`。 |
| `packages/catalog` | `@cvsa/catalog` | 曲目（Song）、创作者（Artist）、歌手（Singer）、创作角色（ArtistRole）与引擎（Engine）领域服务、仓储与 Meilisearch 封装。 |
| `packages/authentication` | `@cvsa/authentication` | Better Auth 认证表集成、Argon2id 密码散列、数据库会话解析、邀请码服务（`InvitationService`）与 CASL 字段级权限策略（`defineAbilityFor`）。 |
| `packages/db` | `@cvsa/db` | 主库（PostgreSQL 18）Drizzle Schema（划分 `core`、`meta`、`platform`、`auth` 四个 Schema）、连接客户端与迁移脚本。 |
| `packages/snapshot-db` | `@cvsa/snapshot-db` | 时序快照与发现库（TimescaleDB / PG 17）Drizzle Schema、超表维护脚本（`ensure-timescale.ts`）与扩展隔离设置。 |
| `packages/network-scheduler` | `@cvsa/network-scheduler` | 面向爬虫的弹性网络调度层，提供自适应限速、熔断健康度评分、请求类型软预留与直连/HTTP 代理适配器。 |
| `packages/env` | `@cvsa/env` | 基于 `@t3-oss/env-core` 的环境变量强类型校验（`env` 与 `crawlerEnv`）及按 `NODE_ENV` 派生的默认连接串。 |
| `packages/logger` | `@cvsa/logger` | Pino 结构化日志封装，自动注入当前 OpenTelemetry Trace Context。 |
| `packages/observability` | `@cvsa/observability` | OpenTelemetry SDK 初始化与 `traceTask` Span 追踪辅助函数。 |
| `packages/typescript-config` | `@cvsa/typescript-config` | 全仓复用的基础 `tsconfig` 配置预设。 |

## 本地环境模板与运行时隔离

仓库通过 `.env.example` 与子包模板文件管理本地配置，实际 `.env` 与 `.env.test` 文件均在 `.gitignore` 中排除。

| 模板文件 | 适用范围 |
| :--- | :--- |
| [`.env.example`](https://github.com/project-cvsa/cvsa/blob/main/.env.example) | 根目录 Compose 端口映射、数据库凭据、Better Auth 密钥、Meilisearch 密钥与部署镜像参数。 |
| [`apps/backend/.env.example`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/.env.example) / `.env.test.example` | 后端开发与测试环境变量。 |
| [`apps/crawler/.env.example`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/.env.example) | 爬虫本地运行与测试环境变量。 |
| [`apps/web/.env.example`](https://github.com/project-cvsa/cvsa/blob/main/apps/web/.env.example) | 前端服务端与公开 API 地址配置。 |
| [`packages/db/.env.example`](https://github.com/project-cvsa/cvsa/blob/main/packages/db/.env.example) / `.env.test.example` | `drizzle-kit` CLI 执行主库迁移与推送时的连接配置。 |

运行时与测试环境的隔离规则如下：

- **数据库隔离**：`@cvsa/env` 根据 `NODE_ENV` 自动选择默认库。当 `NODE_ENV=test` 时，默认连接 `cvsa_test`（5432 端口）与 `cvsa_snapshot_test`（5433 端口）；否则默认连接 `cvsa` 与 `cvsa_snapshot`。显式设置的 `DATABASE_URL` 或 `SNAPSHOT_DATABASE_URL` 会覆盖默认值。
- **队列前缀隔离**：爬虫测试运行时将 BullMQ 队列前缀设为 `cvsa-test-<pid>`，避免并发测试或本地开发队列消息互相干扰；正常运行时前缀为 `bull`。

## 相关文档

- [开发者指南](./guide.md)：环境准备、依赖服务启动与常用 Turborepo 命令。
- [系统架构](./architecture.md)：后端分层架构、前后端类型边界与数据流向。
- [文档协作指南](./how-we-docs/index.md)：工程文档的组织与维护规范。
