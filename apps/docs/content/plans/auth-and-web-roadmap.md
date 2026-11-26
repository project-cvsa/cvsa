---
title: 认证权限与 Web 协同路线图
description: CVSA 身份认证、CASL 权限体系、邀请码准入及 Web 前端协作界面的当前状态与后续规划。
docType: plan
status: planned
---

*Updated 2026-11-27.* 本文档跟踪 `packages/authentication`、`packages/db` 身份域模型以及 `apps/web` 前台与管理台的当前落地状态与演进路线。认证与权限模型的设计取舍见 [ADR 0003](/zh/decisions/0003-auth-casl-and-invitation-onboarding)，编译期国际化方案见 [ADR 0004](/zh/decisions/0004-compile-time-i18n-with-fanee)。

## 当前状态

### 1. 认证模型与邀请码 Onboarding

- **Better Auth 兼容存储**：[packages/db/src/schema/identity.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/schema/identity.ts) 定义 `auth.user`、`auth.account`、`auth.session` 与 `auth.verification` 表，保留 Better Auth 约定的列命名；同时在 `meta` Schema 中定义 `role`、`permission` 与 `role_permission`。
- **单角色与首用户引导**：`auth.user.role_id` 绑定单个角色。系统首个注册用户自动获得 `OWNER` 角色；此后处于邀请制注册模式，必须提供有效的 `invitation_code` 完成注册，并在 `InvitationService.recordRedemption` 中通过数据库事务累加 `used_count` 与写入 `invitation_redemption`。
- **会话与鉴权中间件**：
  - 后端使用 Argon2id 校验口令，签发 `httpOnly` Cookie 会话，并通过 `authMiddleware`（任意登录态）与 `adminAuthMiddleware`（`OWNER` / `admin` / `editor`）保护路由。
  - 前端 [middleware.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/middleware.ts) 按 `i18nHandler -> authMiddleware` 顺序串联执行，在语言重定向生效前短路无意义的数据库会话查询。

### 2. CASL 策略与字段级校验

- **后端细粒度保护**：[packages/authentication/src/ability.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/ability.ts) 定义 `defineAbilityFor` 与 `assertCanUpdateFields`：
  - `OWNER` 与 `admin` 具备 `manage all` 全部能力；
  - `editor` 及普通登录用户可创建与修改 `Artist`、`Singer`、`ArtistRole`，并修改 `Song` 的标准字段（`STANDARD_SONG_FIELDS`，涵盖曲名、时长、封面、Bilibili ID、歌词、外部链接等 13 个字段）；
  - `PRIVILEGED_SONG_FIELDS`（`publishedAt`、`type`、`originalSongId`、`language`）以及 `Engine` 创建/修改、各实体的 `delete` 操作需显式权限标识（如 `catalog:privileged_fields`、`catalog:song:field:<name>`）或管理员角色。

### 3. Web 架构、契约消费与多语言

- **端到端类型契约**：`apps/web` 通过 `@api-contract` 仅类型导入后端 `App` 类型，结合 `@elysiajs/eden`（`treaty<App>`）与 `settle()` 包装函数生成全链路类型安全的 API 调用，借助 `verbatimModuleSyntax` 防止服务端模块进入浏览器打包产物。
- **UI 组件库与设计令牌**：基于 Astro 7 + SolidJS + UnoCSS（`uno.config.ts`）+ `@ark-ui/solid` 构建统一的界面原语（Button、TextField、DateField、DurationField、Select、DataTable 等），配合 `cva()` 与 `cn()` 管理变体状态。
- **编译期多语言**：`locale/` 目录维护 `zh-CN` 与 `en-US` 词条，由 `@fanee/vite` 在构建期生成 `virtual:fanee` 资源并注入 SSR 与 SolidJS 孤岛页面；CI 阶段通过 `fanee check --unused` 阻断孤立或未引用文案。
- **现有页面**：已上线曲目详情 `/song/[id]`、曲目编辑 `/song/[id]/edit`（`SongEditForm.tsx`）、爬虫控制面 `/admin/crawler`（含 `ImmersiveLabeler` 与 `GraphExplorer`）及邀请码管理 `/admin/invitations`。

## 演进方向

### 1. 打通数据库细粒度权限 (`meta.permission` / `meta.role_permission`)

- **现状**：`packages/db` 已建好 `meta.permission` 与 `meta.role_permission` 表，且 `Principal` 与 `defineAbilityFor` 已支持基于 `permissions: string[]`（含 `catalog:*` 通配符）做精确判定；但当前 [session.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/session.ts) 与 `songUpdateHandler` 仅查询并传递了单一 `roleName`，尚未加载角色关联的 `permissions` 列表。
- **规划**：
  1. 在 `getSessionByToken` 或专用的角色权限缓存层中联合读取 `meta.role_permission` 与 `meta.permission.action`。
  2. 将已解析的权限列表注入后端请求上下文与 `createUserPrincipal({ userId, roles, permissions })`，使 `PRIVILEGED_SONG_FIELDS` 与 `Engine` 管理能力真正受数据库配置驱动而非仅靠硬编码角色。
  3. 同步增强 `UserService.signUp`：将用户创建、邀请码核销与凭据写入统一包裹在单个数据库事务中，彻底消除并发抢占同一枚一次性邀请码时的竞态边界。

### 2. 前端 `@casl/ability` 能力同步与表单感知

- **现状**：`SongEditForm.tsx` 当前渲染包含 `type`、`publishedAt` 等受限字段在内的全量表单控件；普通编辑者修改受限字段需等待点击提交后由后端返回 `403 FORBIDDEN`（`error.forbidden.restricted_field`）才会感知无权操作。
- **规划**：
  1. 在 `/v2/me` 接口（`CurrentUserInfoSchema`）与 Astro SSR `Astro.locals` 中返回精简后的能力规则或权限集合。
  2. 在 `apps/web` 中复用 `@cvsa/authentication` 导出的纯前端 `defineAbilityFor` 规则构建函数（避免引入服务端 DB 依赖），使编辑表单按字段禁用受限输入并提示原因，确保前后端策略同源。

### 3. 公开贡献者编目工作流与扩展页面

- **现状**：目前仅实现了曲目（`Song`）的详情与基础编辑页，歌手（`Singer`）、创作者（`Artist`）、专辑（`Album`）与引擎（`SvsEngine`）的展示及编辑页面尚未完整开放，且缺少基于 `meta.history` 的可视化修改历史与版本回看界面。
- **规划**：
  1. 补齐歌手、创作者、专辑详情页与表单组件，复用现有 `DateField`、`TagInput` 等设计系统原语。
  2. 为所有编目实体增加变更历史时间线视图（读取 `meta.history`），让贡献者能够追溯每次字段修改的操作者与前后差异。
  3. 结合早期的 [公开贡献与复核队列构想](/zh/ideas/public-contribution-review-queue)，设计面向开放注册用户的分级提交流程。
