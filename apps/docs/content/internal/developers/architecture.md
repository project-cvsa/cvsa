---
title: 项目架构
description: 了解档案馆的项目组织架构。
---

## 目录结构

项目采用 Turborepo 进行 monorepo 管理，代码分布在 apps 和 packages 两个目录下。

**apps** 目录下是可直接运行的服务：

- `backend`: 后端 API 服务
- `web`: 网站服务
- `docs`: 项目文档（位于 `main` 分支）

**packages** 目录下是共享包，被 apps 依赖使用：

- `core`: 核心业务逻辑，包含 Service、Repository、DTO 定义
- `db`: Prisma schema 和生成的数据库客户端
- `embedding`: 向量化嵌入服务
- `logger`: 日志封装
- `observability`: 链路追踪配置

## 数据库

### Schema 位置

数据库 schema 定义位于 `packages/db/prisma/` 目录下。
其中的目录结构包含：
- 主入口： `schema.prisma`
- 实体定义： `models/`
- 多对多关系表： `relations/`

所有的实体按功能划分为四个 PostgreSQL schema：

- **core**: 核心百科数据，涵盖歌曲、歌手、创作者、专辑、标签等实体
- **auth**: 用户账号与会话管理
- **platform**: 平台特有数据，如用户上传的文件
- **meta**: 角色权限、操作审计日志及其它元信息

## 后端

后端代码遵循 Handler、Service、Repository 三层架构。

### Handler 层

Handler 位于 `apps/backend/src/handlers/` 目录下，负责处理 HTTP 层面的所有事务：解析请求参数、调用下层 Service、构造响应返回。Handler 层不包含业务逻辑。

请求参数的校验使用 Zod Schema 完成。Schema 定义统一放在 `packages/core/src/modules/<module>/dto.ts` 文件中，由 Handler 层引用。

### Service 层

Service 位于 `packages/core/src/modules/<module>/service.ts` 下，是业务逻辑的落脚点。这里处理所有的业务规则：数据校验、业务流程编排、调用 Repository 或外部服务。业务层出错时统一抛出 AppError 异常，由上层 Handler 的全局错误处理机制捕获。

每个业务模块对应一个 Service 类，如 SongService、AuthService。Service 所需的依赖通过 DI 模式由构造函数注入。

### Repository 层

Repository 一般位于 `packages/core/src/modules/<module>/repository.ts`，是数据访问层的实现。Repository 负责与数据库交互，执行纯粹的 CRUD 操作，不涉及任何业务判断。

Repository 采用接口加实现的方式组织。接口定义在 `repository.interface.ts` 中，具体实现在 `repository.ts`。

### 新增接口流程

下面以新增“收藏歌曲”功能为例，说明从数据库到路由的完整开发路径。

首先确认数据层需求。如果只是给 Song 表增加一个收藏数字段，直接在 `packages/db/prisma/models/core/song.prisma` 中添加字段即可。如果需要独立的收藏记录表（如记录哪个用户收藏了哪首歌），则在相应目录下新建 prisma 文件。

然后依次实现数据访问、业务逻辑、请求处理。在 `packages/core/src/modules/catalog/song/` 目录下，编写 `dto.ts` 定义请求响应结构，`repository.ts` 实现数据库操作，`service.ts` 编写业务逻辑。

接着在 `apps/backend/src/handlers/catalog/song/` 目录下编写 Handler。Handler 接收请求、调用 Service、返回结果。

最后将 Handler 注册到路由树。分别在 `handlers/catalog/song/index.ts`、`handlers/index.ts`、`apps/backend/src/index.ts` 中完成导出和挂载。

整体流程自下而上：数据库 schema 定义 → Repository 实现 → Service 封装 → Handler 接入 → 路由注册。
