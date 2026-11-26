---
title: "0001: 编目主库 (PostgreSQL) 与时序追踪库 (TimescaleDB) 双库隔离"
description: 将编目与身份主库保留在标准 PostgreSQL (@cvsa/db)，而将高频时序快照与爬虫发现数据隔离至 TimescaleDB (@cvsa/snapshot-db) 并采用独立脚本管理超表与扩展。
docType: explanation
---

*Recorded 2026-11-27.* CVSA 在存储层将**编目与身份主库**（`@cvsa/db`，运行于标准 PostgreSQL 18）与**爬虫快照与发现追踪库**（`@cvsa/snapshot-db`，运行于 TimescaleDB PG17）拆分为两个物理独立的数据库实例与 Drizzle Schema 包，并通过独立的幂等脚本 [ensure-timescale.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/ensure-timescale.ts) 管理 TimescaleDB 超表、压缩策略、触发器与扩展 Schema 隔离。

## 背景与约束

CVSA 承载两类生命周期与负载特征截然不同的数据：

1. **低频、强关系、需多维事务一致性与历史追溯的编目域**：曲目（`core.song`）、创作者（`core.artist`）、歌手（`core.singer`）、声库与引擎、用户会话（`auth.*`）、修改历史（`meta.history`）与 Meilisearch Outbox（`meta.outbox`）。这类数据表间外键密集，写入伴随事务与缓存失效，单表行数温和增长，但对核心 PostgreSQL 版本特性与查询稳定性要求高。
2. **高频写入、海量膨胀的时序与爬虫工作负载**：`video_snapshot` 随追踪队列持续追加播放、硬币、点赞、收藏、分享、弹幕与评论采样；同时 `video_tracking` 频繁进行基于 `lease_until` 租约的抢占更新，`bilibili_video_metadata` 与 `discovery_sample` 留存大量原始 JSON 与模糊搜索索引（`gin_trgm_ops`）。

若将海量时序表和激进的爬虫后台任务放在同一数据库实例中，高频写入、`VACUUM` 压力及 TimescaleDB 扩展对 PostgreSQL 主版本升级的约束（当前 `timescale/timescaledb:latest-pg17` 与主库 `postgres:18-alpine` 版本不同）会直接拖累前台曲目浏览与用户认证延迟。

## 决策内容

1. **双实例与双 Drizzle 包隔离（[docker-compose.yml](https://github.com/project-cvsa/cvsa/blob/main/docker-compose.yml)）**：
   - `db`（`postgres:18-alpine`，端口 `5432`）由 `@cvsa/db` 独占，通过 `schemaFilter: ["core", "meta", "platform", "auth"]`（[packages/db/drizzle.config.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/db/drizzle.config.ts)）按四组 PostgreSQL Schema 划分表结构，并由 `@cvsa/env` 的 `env.DATABASE_URL` 管理连接。
   - `snapshot-db`（`timescale/timescaledb:latest-pg17`，端口 `5433`）由 `@cvsa/snapshot-db` 独占，通过 `schemaFilter: ["public"]`（[packages/snapshot-db/drizzle.config.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/drizzle.config.ts)）避免 `drizzle-kit push` 误删 TimescaleDB 内置的 `_timescaledb_*` 系统 Schema，并由 `crawlerEnv.SNAPSHOT_DATABASE_URL` 管理连接。
2. **迁移图谱与 TimescaleDB DDL 分离**：
   - `drizzle/` 迁移 SQL 仅负责普通关系表与索引，供 `migrate.ts` 在生产部署执行；
   - `ensure-timescale.ts` 在迁移或 `push` 之后幂等执行：安装 `timescaledb` 扩展，将 `video_snapshot` 升级为 `30` 天分块超表并配置按 `aid` 分段、`captured_at DESC` 排序的 `7` 天压缩策略，创建同步维护 `latest_video_snapshot` 的 `AFTER INSERT` 触发器，并通过 [extensions.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/scripts/extensions.ts) 将 `pg_stat_statements` 与 `pg_trgm` 迁入 `extensions` Schema（同时设置数据库 `search_path`）。
3. **Bun 原生驱动与生命周期参数约定（[packages/db/src/client.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/client.ts)、[packages/snapshot-db/src/client.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/src/client.ts)）**：
   - 构造 `Bun.SQL` 时必须显式传入 `bigint: true`（Bun 会忽略 Drizzle 在实例化之后对 `options.bigint` 的修改，否则所有 `int8` 的曲目 ID 与 Bilibili `aid` 会退化为字符串）。
   - 运行时连接池限定 `idleTimeout: 60`、`maxLifetime: 1800`，使长生命周期的 TimescaleDB 后端定期释放会话级分块缓存与执行计划；而 `migrate.ts` 与 `ensure-timescale.ts` 显式传入 `idleTimeout: 0`，避免耗时较长的表转换或压缩策略创建中途断连。

## 备选方案与取舍

- **备选方案一：单库多 Schema 共享同一个 PostgreSQL + TimescaleDB 实例**。部署更省资源，但主库无法升级到 PostgreSQL 18、爬虫突发写压力会争抢登录与曲目搜索的连接池与 I/O，且双包各持有一个独立连接池与生命周期更便于独立扩缩容。
- **备选方案二：将 `create_hypertable` 与触发器手写进 Drizzle 迁移 SQL 文件**。开发与测试环境常用 `drizzle-kit push --force` 直接同步 Schema，不会重放迁移目录中的手写钩子，会导致开发/测试库与生产库行为不一致。将其独立于迁移图谱并保证全量幂等，使 `push` 与 `migrate:deploy` 两条路径最终收敛到同一数据库状态。

## 影响与后续约束

- 跨库不能建立数据库级外键约束；编目库与快照库之间的关联（如通过 `bilibili_aid` 或运营用户 `x-user-id`）必须在应用服务层协调，而不能依赖跨库 JOIN。
- 任何新增 TimescaleDB 策略或扩展安装均须合入 `ensure-timescale.ts` / `extensions.ts` 并保持幂等，禁止绕过 `extensions` Schema 在 `public` 中直接安装扩展。
