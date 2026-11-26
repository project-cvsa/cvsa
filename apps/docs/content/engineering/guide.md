---
title: 开发者指南
description: 在本地搭建 CVSA 开发环境、拉起依赖容器、初始化数据库并运行全仓构建与测试。
docType: how-to
---

按照本指南在本地准备 Bun 运行时、环境变量与容器依赖服务，完成主库与时序快照库初始化，并运行日常开发与提交前验证命令。

## 准备工具与克隆仓库

本地开发需要 Git（或 Jujutsu `jj`）、[Bun](https://bun.sh)（仓库指定 `bun@1.4.2`）以及 [Docker Compose](https://docs.docker.com/compose/install/)。

从 GitHub 克隆仓库并安装依赖：

```bash
git clone https://github.com/project-cvsa/cvsa
cd cvsa
bun install
```

如需安装 Bun，可执行官方安装脚本：

```bash tab="Linux/macOS"
curl -fsSL https://bun.sh/install | bash
```

```bash tab="Windows"
powershell -c "irm bun.sh/install.ps1 | iex"
```

## 配置本地环境变量

在拉起依赖服务或运行测试前，按需复制仓库中的示例配置模板：

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/backend/.env.test.example apps/backend/.env.test
cp apps/crawler/.env.example apps/crawler/.env.test
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
cp packages/db/.env.test.example packages/db/.env.test
```

`@cvsa/env` 会按 `NODE_ENV` 自动派生开发库（`cvsa` / `cvsa_snapshot`）与测试库（`cvsa_test` / `cvsa_snapshot_test`）默认地址。如需覆盖，请确保 `.env.test` 指向独立的测试数据库，以免测试重置清理开发数据。

## 启动依赖服务并初始化数据库

仓库根目录的 [`docker-compose.yml`](https://github.com/project-cvsa/cvsa/blob/main/docker-compose.yml) 统一编排全部本地基础设施容器：

- `db`：`postgres:18-alpine`（默认映射主机 `5432` 端口），启用 `pg_stat_statements` 预加载库。
- `snapshot-db`：`timescale/timescaledb:latest-pg17`（默认映射主机 `5433` 端口），启用 `timescaledb` 与 `pg_stat_statements`。
- `meili`：`getmeili/meilisearch:v1.40`（默认映射主机 `7700` 端口）。
- `redis`：`redis:7-alpine`（默认映射主机 `6379` 端口，关闭驱逐策略 `noeviction`，用于 BullMQ 队列）。
- `redis-cache`：`redis:7-alpine`（默认映射主机 `6380` 端口，`allkeys-lru` 缓存策略）。

在仓库根目录启动依赖容器并等待健康就绪，随后执行测试库初始化：

```bash
docker compose up -d --wait db snapshot-db redis redis-cache meili
bun run setup
```

`bun run setup` 会通过 Turborepo 触发 `@cvsa/db#test:setup` 与 `@cvsa/snapshot-db#test:setup`，创建测试数据库、安装扩展、推送 Drizzle Schema 并配置 TimescaleDB 超表与压缩策略。

## 常用开发与验证命令

在仓库根目录执行以下命令进行本地开发与质量验证：

```bash
bun run dev
bun run ci
bun run typecheck
bun run test
bun run build
```

各命令对应的核心作用如下：

| 命令 | 作用说明 |
| :--- | :--- |
| `bun run dev` | 并行启动工作区各应用的开发模式。 |
| `bun run ci` | 执行 `biome ci .` 与 `fanee check --unused`（包含格式、静态规则与多余 i18n 词条校验）。 |
| `bun run format` | 使用 Biome 格式化全仓代码。 |
| `bun run typecheck` | 运行全仓 TypeScript 静态类型验证。 |
| `bun run test` | 先执行 `test:reset` 重置测试库，再运行各包自动化测试。 |
| `bun run test:coverage` | 重置测试库并生成测试覆盖率报告。 |
| `bun run build` | 按依赖图拓扑构建所有应用与包的生产产物。 |

如果只需验证单个子项目，可以使用 `--cwd` 或 `--filter` 限定范围，例如 `bun run --cwd apps/web test` 或 `bun run --cwd apps/docs types:check`。文档站单包改动时可使用 `env -u BIOME_CONFIG_PATH bunx --bun biome check --write <paths>`，避免编辑器环境变量干扰。

## 提交改动与发起 PR

开发任务建议从 `main` 分支切出，使用 Jujutsu（`jj`）管理独立变更，并在提交前依次通过 `bun run ci`、`bun run typecheck` 与 `bun run test`。详细分支命名、Conventional Commits 与 PR 模板约定请参阅 [分支与 PR 工作流](./practices/workflow.md)。
