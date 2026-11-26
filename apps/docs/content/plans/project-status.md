---
title: 项目总览与各子系统状态
description: CVSA Monorepo 各应用与共享包的当前实现状态、技术债与近期里程碑。
docType: plan
status: planned
---

*Updated 2026-11-27.* 本文汇总 CVSA Monorepo 下全部主要应用（`apps/*`）与核心共享包（`packages/*`）的代码落地状态、已知边界与近期演进目标。

## 当前状态

| 子系统 | 核心技术栈 | 当前已落地能力 | 已知缺口与待办 |
| :--- | :--- | :--- | :--- |
| `apps/backend` | Bun, Elysia, OpenTelemetry | `/v2` REST API、健康状态端点（`/health`）、认证/编目/邀请码/爬虫控制面代理、Outbox 异步同步 Worker、`X-Trace-ID` 链路透传 | 曲目搜索接口 `/v2/songs` 尚待补全 Zod 响应 Schema；爬虫代理尚未细分为编辑与运维两级角色中间件 |
| `packages/catalog` | Drizzle ORM, Redis, CASL | 曲目、创作者、歌手、引擎与角色读写封装，事务内联动写入 `meta.history` 与 `meta.outbox` 并失效缓存 | 部分关联实体（如专辑、丛书）的完整写入与搜索编排仍在扩展中 |
| `packages/authentication` | Better Auth 兼容表结构, Argon2id, CASL | `auth.user` 单角色绑定、首用户 `OWNER` 引导、邀请码校验与事务化核销、`STANDARD_SONG_FIELDS` 与 `PRIVILEGED_SONG_FIELDS` 字段级策略 | `meta.permission` 与 `meta.role_permission` 尚未在会话解析与 `Principal` 构建时注入 |
| `apps/crawler` | Elysia, BullMQ, TimescaleDB, ONNX | 分层快照调度、搜索漫游（增量 10 分钟窗口 + 深度切片）、`akari` ONNX 分类、双层标注策展、元数据补齐、SigNoz PromQL 查询 | 控制面数据集导出受单页查询上限限制需改用分批游标；`uncertain` 标注在部分路径需与 `pending` 策展状态对齐 |
| `apps/web` | Astro SSR, SolidJS, UnoCSS, `@fanee/vite` | 域名制中英双语路由、编译期 i18n、`/login` 与 `/register`、`/song/[id]` 详情与编辑页、`/admin/crawler`（含沉浸式标注与图谱浏览）与 `/admin/invitations` | 运行时 4 个发现布尔开关尚未全部呈现于设置表单；缺少前端 CASL 能力联动及创作者/歌手/专辑在线编辑页 |
| `apps/embedding` | Bun, Elysia, ONNX Runtime, HuggingFace | `:14900` 独立微服务，提供 `GET /health` 与 `POST /embeddings` 供后端语义索引调用 | 仅承担向量生成服务，与前端或外部公开流量隔离 |
| `apps/deploy` | Bun, Docker Compose, Turbo | `plan.ts` 基于 `--affected` 与级联规则（`crawler -> backend -> web`、`locale/` 全局生效）规划镜像构建；Webhook 部署守护进程与旧镜像清理 | 依赖宿主机本地模型挂载目录（`./model`）及 GHCR 镜像拉取凭证 |
| `apps/docs` | Next.js, Fumadocs MDX | 面向外部贡献者的用户手册、工程规范、路线图、ADR、外部参考与早期想法分离结构 | 英文文档与部分遗留迁移页面的持续同步与补充 |

## 各子系统明细与演进方向

### 1. 主后端与编目领域 (`apps/backend`, `packages/catalog`, `packages/db`)

- **当前状态**：
  - [apps/backend/src/index.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/index.ts) 挂载 `/v2` 前缀路由，统一启用 CORS（支持 `WEB_ORIGINS` 与 `SITE_ADDRESS` 动态匹配）、OpenTelemetry 链路追踪、Pino 日志中间件与全局 `AppError` 错误翻译中间件。
  - [packages/catalog/src/song/SongWriter.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/catalog/src/song/SongWriter.ts) 在同一数据库事务内完成曲目写入、CASL 字段校验、`meta.history` 变更记录与 `meta.outbox` 事件入队，并在提交后清理 `RedisCatalogCache`。
  - 异步 Outbox Worker（[apps/backend/src/outbox/](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/outbox)）消费事件并将文档同步至 Meilisearch（配合 `apps/embedding` 生成向量）。
- **演进方向**：
  - 为 `songSearchHandler` 补齐 `@cvsa/contracts` 中的请求与响应 Zod DTO，消除路由契约盲区。
  - 完善专辑（`core.album`）、丛书（`core.song_series`）与创作者关联的读写 API，为公开编目页面提供完整支撑。

### 2. 爬虫、发现与时序库 (`apps/crawler`, `packages/snapshot-db`, `packages/network-scheduler`)

- **当前状态**：
  - 完整实现多适配器网络调度（`@cvsa/network-scheduler`）、Bilibili WBI/设备票据自动续期、BullMQ 追踪与发现双队列、TimescaleDB 超表压缩（7 天压缩、30 天分块）以及 `latest_video_snapshot` 触发器冗余视图。
  - 发现筛选、标注策展与运行时执行配置的具体现状与演进细节见 [爬虫发现、标注策展与调度路线图](./crawler-and-discovery-roadmap.md)。
- **演进方向**：
  - 将发现筛选从“单层词表 + 单分类器推理”推进至多阶段漏斗，降低非目标视频的详情接口与模型推理开销。
  - 按后端职责进一步收紧 `/admin/crawler/*` 代理路由的 RBAC 粒度（区分 `editor` 标注权限与 `admin`/`OWNER` 运维操作权限）。

### 3. 认证与 Web 应用 (`packages/authentication`, `apps/web`, `locale/`)

- **当前状态**：
  - 邀请码注册闭环、路由级鉴权守卫、Eden Treaty 契约客户端（`@api-contract`）以及 `fanee` 编译期多语言打包已全面投入使用，详情见 [认证权限与 Web 协同路线图](./auth-and-web-roadmap.md)。
- **演进方向**：
  - 打通 `meta.permission` / `meta.role_permission` 至会话与前端 CASL 实例，并建设面向普通贡献者的创作者、歌手、专辑编辑流程与变更历史浏览界面。

### 4. 向量服务与部署基础设施 (`apps/embedding`, `apps/deploy`, `docker-compose.yml`)

- **当前状态**：
  - `docker-compose.yml` 统一编排 `web`、`backend`、`crawler`、`embedding`、`db`（PostgreSQL 18）、`snapshot-db`（TimescaleDB PG17）、`meili`、`redis` 与 `redis-cache`（512MB `allkeys-lru`）。
  - `apps/deploy/src/plan.ts` 通过 `turbo ls --affected` 与静态非代码路径排除，在 CI 中仅重建受影响的容器镜像，并由宿主机部署服务执行滚动拉取与清理。
- **演进方向**：
  - 随服务规模增长持续完善生产环境可观测告警（SigNoz PromQL 指标与延迟分位看板）及模型产物的版本化分发流程。
