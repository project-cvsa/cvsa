---
title: "0003: Better Auth 兼容存储、CASL 字段策略与邀请码事务准入"
description: 采用 Better Auth 兼容的数据库表结构、单角色模型、CASL 主体与字段级授权策略以及邀请码核销机制。
docType: explanation
---

*Recorded 2026-11-27.* CVSA 的身份认证与授权系统在 `@cvsa/db` 与 `@cvsa/authentication` 中采用 **Better Auth 兼容的 `auth` 表结构**、**`auth.user.role_id` 单角色模型**、**基于 CASL 的字段级访问策略**以及**默认邀请制注册流程**。

## 背景与约束

CVSA 是一个处于持续建设期的开源社区档案馆，其认证与权限需求具有三个具体特征：

1. **可控的早期开放节奏**：上线初期由维护者与核心编辑共同整理曲目与标注训练样本，既要避免未受控的匿名注册写入垃圾数据，又需要保留平滑切换至社区注册的底层表结构。
2. **字段级差异化授权**：普通编辑者（`editor`）可以补充曲名、简介、歌词、封面和外部链接等常规信息，但诸如曲目类型（`type`）、发布时间（`publishedAt`）和关联原曲（`originalSongId`）等关键结构字段需要更高权限保护。
3. **跨运行时复用**：同一套权限判定不仅服务于 `apps/backend` 的 HTTP 请求，也必须能表达非人类主体的服务凭据（`ServicePrincipal`），并在未来延伸至前端界面控制。

## 决策内容

1. **Better Auth 兼容表结构与独立会话/密码实现**：
   - [packages/db/src/schema/identity.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/schema/identity.ts) 保留 `auth.user`、`auth.account`、`auth.session` 与 `auth.verification` 的表名与 Better Auth 约定字段（包括 `userId`、`expiresAt` 等驼峰列名），确保数据结构可直接兼容 Better Auth 生态工具。
   - 会话生命周期、Cookie 解析与密码哈希由 [packages/authentication](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src) 自主实现（使用 Bun 原生 Argon2id 算法与数据库会话令牌），直接与 `Principal` 和 `AppError` 对接，避免框架耦合带来的黑盒行为。
2. **单角色绑定与首用户 `OWNER` 引导**：
   - `auth.user.role_id` 外键关联 `meta.role`。当库内尚无任何用户时，首个注册账号通过并发安全的 `ensureOwnerRole()`（`onConflictDoNothing`）自动获得 `OWNER` 角色，无需手工执行种子脚本初始化管理员。
   - 后续所有非测试环境注册必须携带有效 `invitation_code`。`InvitationService.recordRedemption`（[packages/authentication/src/invitation/service.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/invitation/service.ts)）在数据库事务内递增 `used_count` 并写入 `invitation_redemption` 流水，由 `OWNER` 与 `admin` 在 `/admin/invitations` 统一签发与吊销（默认赋予 `editor` 角色）。
3. **CASL 主体与字段级策略（[packages/authentication/src/ability.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/ability.ts)）**：
   - 将曲目可写字段明确划分为 `STANDARD_SONG_FIELDS`（`name`、`duration`、`description`、`coverUrl`、`localizedNames`、`lyrics`、`externalLinks` 等 13 项）与 `PRIVILEGED_SONG_FIELDS`（`publishedAt`、`type`、`originalSongId`、`language`）。
   - `SongWriter` 在更新事务内调用 `assertCanUpdateFields`，逐字段校验调用方 `Principal` 的 `AppAbility`，越权时直接抛出 HTTP `403`（`error.forbidden.restricted_field`）。

## 备选方案与取舍

- **备选方案一：完全托管给 Better Auth 内置 HTTP 路由与插件体系**。虽然能快速得到登录接口，但定制邀请码绑定角色、首用户 `OWNER` 引导以及与 Elysia 全局 `AppError` / `i18nMiddleware` / `X-Trace-ID` 的集成路径较绕。保留兼容表结构同时精简服务端逻辑，兼顾了迁移退路与代码透明度。
- **备选方案二：纯基于路由角色的粗粒度 RBAC（无 CASL 字段校验）**。无法满足“同一编辑页面允许编辑者改歌词和封面、但限制修改曲目类型或原始关联”的编目需求，且后续难以细化字段权限点。

## 影响与后续约束

- 当前 `getSessionByToken`（[session.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/session.ts)）与 `songUpdateHandler` 仅向下传递了 `roleName`，尚未读取 `meta.permission` 与 `meta.role_permission` 填充 `permissions` 数组；打通数据库细粒度权限及前端 `@casl/ability` 同步已列入 [认证权限与 Web 协同路线图](/zh/plans/auth-and-web-roadmap)。
- 在 `UserService.signUp` 中，应将用户创建、邀请码核销与凭据插入进一步统一到单个事务内，消除高并发抢注单次邀请码时的残留风险。
