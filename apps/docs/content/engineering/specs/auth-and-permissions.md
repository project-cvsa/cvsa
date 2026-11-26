---
title: 认证与权限模型规约
description: Better Auth 身份表结构、邀请制注册事务、会话鉴权中间件与 CASL 字段级权限策略。
docType: reference
---

`packages/authentication` 与 `packages/db` 中的 `auth` / `meta` Schema 共同构成 CVSA 的身份认证与授权系统，覆盖邀请制注册、数据库会话校验以及针对编目实体的动作与字段级访问控制。

## 身份数据模型

身份与权限数据存储在主库的两个 PostgreSQL Schema 中（定义见 [`packages/db/src/schema/identity.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/schema/identity.ts)）：

- **`auth` Schema**：保存 Better Auth 核心表（`user`、`account`、`session`、`verification`）以及邀请系统表（`invitation_code`、`invitation_redemption`）。其中 `auth.user` 通过 `role_id` 关联单一角色，保留 Better Auth 原生列命名约定。
- **`meta` Schema**：保存 `role`、`permission` 与多对多关联表 `role_permission`。系统内建 `OWNER`（所有者）、`admin`（管理员）与 `editor`（编辑者）等角色名称。

## 邀请制注册与会话流程

### 邀请制注册 (`UserService.signUp`)

[`UserService`](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/user/service.ts) 与 [`InvitationService`](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/invitation/service.ts) 按以下规则处理新账号创建：

1. **首用户引导**：当 `auth.user` 表为空（尚无任何用户）时，首个注册用户自动通过 `ensureOwnerRole()` 创建并绑定 `OWNER` 角色，无需邀请码。
2. **受邀注册**：系统已有用户后（非 `NODE_ENV === "test"` 环境），注册必须携带有效的 `inviteCode`。`InvitationService.validate` 校验邀请码存在、未过期且 `used_count < max_uses`，否则抛出 `INVITE_CODE_REQUIRED`、`INVALID_INVITE_CODE`、`INVITE_CODE_EXPIRED` 或 `INVITE_CODE_EXHAUSTED`。
3. **用户名与邮箱唯一性**：若用户名或邮箱已被占用，返回 `409`（`USERNAME_IS_ALREADY_TAKEN` 或 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`）。
4. **事务核销与凭据写入**：创建用户后，通过数据库事务原子递增 `invitation_code.used_count` 并写入 `invitation_redemption` 兑换记录，使用 Argon2id 对密码进行散列存储，并立即签发数据库会话。

### 会话与管理员路由保护

- **密码登录与会话解析**：支持邮箱或用户名登录，服务端生成随机 Token 写入 `auth.session` 并通过 httpOnly Cookie（或 `Authorization` 头）传递；`resolveAuthFromHeaders` 在每次请求时校验会话有效期与关联角色。
- **路由级中间件**：
  - `authMiddleware`：要求存在有效已登录会话，未认证返回 `401 UNAUTHORIZED`。
  - `adminAuthMiddleware`：除要求已登录外，限制仅 `OWNER`、`admin` 与 `editor` 角色可访问（用于 `/v2/admin/crawler` 等管理面），否则返回 `403 FORBIDDEN`。
  - `invitationAdminHandler`（`/v2/admin/invitations`）：在 `adminAuthMiddleware` 之上进一步限制仅 `OWNER` 与 `admin` 可查看、签发或吊销邀请码。

## CASL 主体模型与字段级权限

[`packages/authentication/src/ability.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/ability.ts) 基于 `@casl/ability` 定义动作集合（`manage`、`create`、`read`、`update`、`delete`）与实体主体（`all`、`Song`、`Artist`、`Singer`、`Engine`、`ArtistRole`），由 [`principal.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/authentication/src/principal.ts) 构建用户或服务主体：

| 角色或主体类型 | 授予权限范围 |
| :--- | :--- |
| `OWNER` 或 `admin` | 拥有 `can("manage", "all")`，对所有实体与字段具备完整读写与删除权（`createUserPrincipal` 同时为其展开包含 `OWNER`、`admin`、`editor` 角色）。 |
| `editor` 或普通登录 `user` / `service` | 允许对所有主体执行 `read`；允许 `create` `Song`、`Artist`、`Singer`、`ArtistRole`；允许 `update` `Artist`、`Singer`、`ArtistRole`；允许 `update` `Song` 的标准字段集 `STANDARD_SONG_FIELDS`。 |
| 细粒度权限字符串 (`permissions`) | 支持通配符前缀匹配（如 `catalog:engine:*`），按需解锁受限操作与字段。 |

### `Song` 字段分级保护

在更新 `Song` 实体时，服务层调用 `assertCanUpdateFields(ability, "Song", input, existing)` 逐字段校验权限，拒绝未授权字段写入并抛出 `403 FORBIDDEN`（`error.forbidden.restricted_field`）：

- **标准字段 (`STANDARD_SONG_FIELDS`)**：`name`、`duration`、`description`、`coverUrl`、`localizedNames`、`localizedDescriptions`、`bilibiliAid`、`bilibiliBvid`、`vocadbId`、`vcpediaId`、`moegirlId`、`lyrics`、`externalLinks`。
- **特权字段 (`PRIVILEGED_SONG_FIELDS`)**：`publishedAt`、`type`、`originalSongId`、`language`。需持有 `catalog:privileged_fields`、`catalog:song:privileged_fields` 或单字段权限 `catalog:song:field:<field>` 才可修改。
- **引擎管理与删除权限**：`Engine` 创建需要 `catalog:engine:create`（或 `catalog:engine:*`），更新需要 `catalog:engine:update` / `catalog:engine:edit`；各实体的 `delete` 操作需对应 `catalog:<entity>:delete` 或 `catalog:delete` 权限。
