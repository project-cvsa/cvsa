---
title: TimescaleDB 与 Drizzle 运维边界
description: "@cvsa/db 与 @cvsa/snapshot-db 的架构分离、TimescaleDB 超表与压缩策略、扩展隔离以及 Drizzle 迁移和推库约束。"
docType: reference
---

*Recorded 2026-11-27.* CVSA 将目录主库（`@cvsa/db`，PostgreSQL 18）与爬虫时序库（`@cvsa/snapshot-db`，TimescaleDB on PostgreSQL 17）拆分为两个独立实例。两者共用 `drizzle-orm` + Bun 原生 `SQL` 驱动，但在超表声明、扩展 Schema 与长耗时 DDL 处理上存在明确边界。

## `video_snapshot` 超表与触发器初始化

`drizzle-kit` 仅描述常规 PostgreSQL 表结构，无法表达 TimescaleDB 超表分区间隔、列式压缩属性与后台压缩任务。因此 [`ensure-timescale.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) 作为独立幂等脚本，在生产迁移（`migrate:deploy`）和开发/测试推库（`db:update`）之后执行。

| 对象 / 策略 | 配置参数 | 作用与约束 | 源码位置 |
| :--- | :--- | :--- | :--- |
| `video_snapshot` 主键 | `(aid, captured_at)` | TimescaleDB 要求超表唯一键/主键必须包含分区时间列 `captured_at` | [`snapshot.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/src/schema/snapshot.ts) |
| 超表分区间隔 | `chunk_time_interval => INTERVAL '30 days'` | 通过 `create_hypertable` 与 `set_chunk_time_interval` 幂等维持 30 天 chunk | [`ensure-timescale.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) |
| 列式压缩与分段 | `compress_segmentby = 'aid'`，`compress_orderby = 'captured_at DESC'` | 按视频 ID 分段、时间倒序压缩，7 天以上历史 chunk 自动压缩 | [`ensure-timescale.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) |
| 压缩与保留策略 | `add_compression_policy(..., INTERVAL '7 days')`；移除 retention policy | 禁止自动丢弃历史快照，仅对超过 7 天的 chunk 开启压缩 | [`ensure-timescale.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) |
| `trg_update_latest_video_snapshot` | `AFTER INSERT ON video_snapshot` | 调用 `update_latest_video_snapshot()` 维护 `latest_video_snapshot`，仅当 `views` 更高或 `captured_at` 更新时覆盖 | [`ensure-timescale.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) |

脚本末尾会直接查询 `timescaledb_information.hypertables` 与 `timescaledb_information.jobs`，确认 `compression_enabled` 与 `policy_compression` 均已就绪，否则直接报错中断启动。在 [`Dockerfile`](https://github.com/project-cvsa/cvsa/blob/main/Dockerfile) 中，`crawler` 容器入口会依次运行 `bun dist/migrate.js && bun dist/ensure-timescale.js && exec bun dist/index.js`。

## `extensions` Schema 隔离与 `search_path`

在 `cvsa_snapshot` 中，`pg_stat_statements` 与 `pg_trgm` 统一隔离至独立的 `extensions` Schema，而非留在 `public`：

- [`packages/snapshot-db/drizzle.config.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/drizzle.config.ts) 配置了 `schemaFilter: ["public"]`，用于阻止 `drizzle-kit push` 扫描并尝试删除 TimescaleDB 内部维护的 `_timescaledb_*` Schema。
- 若将 `pg_stat_statements` 视图或 `pg_trgm` 操作符留在 `public`，`drizzle-kit push` 会将未出现在 `src/schema/` 中的扩展对象识别为待删除漂移对象。
- [`extensions.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/extensions.ts) 创建 `extensions` Schema 并授予 `PUBLIC` 使用权限，使用 `ALTER EXTENSION ... SET SCHEMA "extensions"` 或 `CREATE EXTENSION ... WITH SCHEMA "extensions"` 安置扩展，并执行数据库级 `ALTER DATABASE ... SET search_path TO "$user", public, extensions`。这样业务 SQL 和 `gin_trgm_ops` 索引无需显式加 Schema 前缀即可解析，同时完全避开 `schemaFilter: ["public"]` 的清理范围。

在主库 [`packages/db/drizzle.config.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/db/drizzle.config.ts) 中，业务表分布在 `core`、`meta`、`platform`、`auth` 四个显式声明的 Schema 内，同样通过 `schemaFilter: ["core", "meta", "platform", "auth"]` 隔离 `public` 或扩展 Schema。

## Bun `SQL` 驱动配置与长耗时 DDL

`@cvsa/db`（[`packages/db/src/client.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/client.ts)）与 `@cvsa/snapshot-db`（[`packages/snapshot-db/src/client.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/src/client.ts)）均直接封装 Bun 内置的 `SQL` 客户端，以下参数不可省略：

- **构造时开启 `bigint: true`**：Bun 要求在 `new SQL({ bigint: true })` 构造阶段传入该标志，若依赖 Drizzle 在构造后修改 `client.options.bigint`，会被 Bun 忽略，导致所有 `int8` 列（歌曲 ID、Bilibili `aid`）退化为字符串。
- **在线请求池与连接生命周期**：常规运行时连接默认设置 `idleTimeout: 60` 秒与 `maxLifetime: 1800` 秒（主库 `max: 10`，时序库 `max: 12`），使长运行进程能够周期性释放 PostgreSQL/TimescaleDB 会话级 chunk 元数据与执行计划缓存。
- **迁移与长耗时 DDL 使用 `idleTimeout: 0`**：全表创建 GIN `trgm` 索引、大表迁移或 `create_hypertable` 在生产环境可能耗时超过 60 秒。[`packages/db/scripts/migrate.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/db/scripts/migrate.ts)、[`packages/snapshot-db/scripts/migrate.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/migrate.ts) 与 `ensure-timescale.ts` 均显式传入 `idleTimeout: 0`，避免长语句执行期间连接被客户端空闲回收。

## `drizzle-kit push` 与 `migrate` 使用边界

| 命令 / 脚本 | 适用场景 | 内部行为 | 注意事项 |
| :--- | :--- | :--- | :--- |
| `bun run migrate:deploy` | 生产启动、预发布验证 | 运行 `scripts/migrate.ts`（并执行 `ensure-timescale.ts`），按顺序回放 `drizzle/` 下的已提交 SQL | 通过 `drizzle.__drizzle_migrations` 幂等记录版本；容器构建将 `drizzle/` 复制到 `dist/drizzle` |
| `bun run db:update` / `test:setup` | 本地开发、CI 测试库初始化 | 先运行 `scripts/test-setup.ts` 调用 [`ensureDatabase`](https://github.com/project-cvsa/cvsa/blob/main/packages/env/src/database.ts) 建库与装扩展，再执行 `drizzle-kit push --force`（时序库随后跑 `ensure-timescale.ts`） | `drizzle-kit push` 不负责自动创建缺失数据库（Compose 仅首次创建 `POSTGRES_DB`），也不运行 `drizzle/` 迁移历史 |
| `bun run migrate:generate` | Schema 变更后生成 SQL 迁移 | 根据 `src/schema/` 生成带快照的 SQL 迁移目录 | 不要在未显式规划的情况下手动删除或合并已有 `drizzle/` 快照，以免破坏历史连续性 |

## Docker Compose Postgres 启动参数

在 [`docker-compose.yml`](https://github.com/project-cvsa/cvsa/blob/main/docker-compose.yml) 中，`db`（`postgres:18-alpine`）与 `snapshot-db`（`timescale/timescaledb:latest-pg17`）均通过 `command` 数组显式传递命令行 `-c` 参数：

- `db` 服务：`postgres -c listen_addresses=* -c shared_preload_libraries=pg_stat_statements`
- `snapshot-db` 服务：`postgres -c listen_addresses=* -c shared_preload_libraries=timescaledb,pg_stat_statements`

官方 Postgres 容器镜像在未指定外部自定义 `config_file` 时，由入口脚本确保网络监听；若通过挂载自定义静态 `postgresql.conf` 并指定 `-c config_file=...` 覆盖默认启动行为，若文件中遗漏 `listen_addresses = '*'`，数据库会退化为仅监听 `localhost`，导致同网络中的 `backend`、`crawler` 容器无法建连。调优参数（如内存或连接数）应继续通过 Compose `command` 的 `-c` 标志传入，并在宿主机挂载卷时保持 `listen_addresses=*` 显式生效。
