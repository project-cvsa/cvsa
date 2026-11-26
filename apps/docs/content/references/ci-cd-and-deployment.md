---
title: CI/CD 与容器化部署
description: apps/deploy 变更影响面计算与级联规则、多阶段 Dockerfile 分层构建、GHCR 镜像发布以及宿主机 Webhook 部署守护进程。
docType: reference
---

*Recorded 2026-11-27.* CVSA 通过 [`.github/workflows/deploy.yml`](https://github.com/project-cvsa/cvsa/blob/main/.github/workflows/deploy.yml)、根目录 [`Dockerfile`](https://github.com/project-cvsa/cvsa/blob/main/Dockerfile)、[`docker-compose.yml`](https://github.com/project-cvsa/cvsa/blob/main/docker-compose.yml) 与 [`apps/deploy`](https://github.com/project-cvsa/cvsa/blob/main/apps/deploy/src/index.ts) 实现基于变更范围的镜像构建与生产宿主机无仓库构建部署。

## `apps/deploy/src/plan.ts` 变更规划与级联规则

推送至 `main` 或手动触发 `workflow_dispatch` 时，CI 首先执行 `bun apps/deploy/src/plan.ts` 计算需要构建并发布的服务列表（合法目标为 `backend`、`crawler`、`embedding`、`web`）以及不可变镜像标签 `sha-<12位提交哈希>`：

1. **手动指定覆写**：当 `RELEASE_SERVICE` 不为 `affected` 时，`all` 直接返回全部 4 个服务，指定服务名则仅构建该服务。
2. **非代码文件跳过（`NON_CODE_PATTERNS`）**：[`plan.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/deploy/src/plan.ts) 先执行 `git diff --name-only <base> <head>`（初始/全零 `before` 时回退为 `HEAD^`）。若所有改动文件均匹配以下模式，则返回空数组 `[]` 跳过后续构建与部署：
   - `README*.md`、`*.md`、`LICENSE`
   - `apps/docs/**`
   - `.github/ISSUE_TEMPLATE/**`、`.github/workflows/build-docs.yml`
   - 编辑器与助手配置目录（`.vscode/`、`.idea/`、`.zed/`、`.gemini/`、`.trae/`、`.opencode/`）及 `.DS_Store`
3. **全局影响文件（`isGlobalImpactFile`）**：只要存在任意非文档文件位于 `locale/` 目录，或位于 `apps/` 与 `packages/` 之外（如根目录 `package.json`、`bun.lock`、`turbo.json`、`Dockerfile`、`docker-compose.yml`、`.github/workflows/deploy.yml`），直接触发全量构建 4 个服务。
4. **Turbo 依赖图与服务级联**：仅涉及 `apps/` 或 `packages/` 内代码时，调用 `bunx --bun turbo ls --affected --filter=...[<base>...<head>] --output json` 获取受影响工作区，并额外叠加服务级联规则：
   - `@cvsa/crawler` 受影响 → 强制追加 `@cvsa/backend`（因后端代理并强依赖爬虫控制面契约）。
   - `@cvsa/backend` 受影响 → 强制追加 `@cvsa/web`（因前端通过 `@api-contract` 类型推导绑定后端路由与响应结构）。

## 多阶段 `Dockerfile` 分层构建

[`Dockerfile`](https://github.com/project-cvsa/cvsa/blob/main/Dockerfile) 以 `oven/bun:1.4.2-debian` 为基础镜像（预装 `ca-certificates`、`curl`、`libgomp1`、`libstdc++6` 以支持 ONNX Runtime 与 OpenCC 原生库），划分为 11 个阶段：

| 阶段 / 目标 | 关键输入与行为 | 产物体积与运行时细节 |
| :--- | :--- | :--- |
| `deps` | 复制根目录及全部 16 个工作区的 `package.json`、`bun.lock`、`turbo.json` | 执行 `bun install --frozen-lockfile --ignore-scripts`；新增工作区包时必须同步更新此列表，否则冻结安装失败 |
| `source` | 复制 `packages/` 与 `locale/` | 先构建 `@cvsa/network-scheduler`，供后续所有服务构建阶段复用 |
| `backend` | 复制 `apps/backend/dist` 与 `locale/` | 打包主服务 `dist/index.js`、`dist/migrate.js` 与 `dist/drizzle`；启动先执行迁移再启动 Elysia 服务（`16412`） |
| `crawler` | 复制 `apps/crawler/dist` 并 `--no-save` 安装原生外部依赖 | `bun build` 将 `onnxruntime-node@1.30.0`、`sharp@0.35.4`、`header-generator@2.1.89` 设为 `--external` 并在运行层单独安装；启动依次执行 `dist/migrate.js`、`dist/ensure-timescale.js` 与 `dist/index.js`（`16413`） |
| `embedding` | 复制 `apps/embedding/dist` 并 `--no-save` 安装 `onnxruntime-node`、`sharp` | 暴露 `/app/model` 卷与 `14900` 端口；`HEALTHCHECK` 探测 `/health` |
| `web` | `web-builder` 同时复制 `apps/web` 与 `apps/backend` 进行 Astro/Solid SSR 编译；运行层安装 `opencc@^1.4.1`、`sharp@0.35.4` | 复制 `apps/backend` 仅用于解析 `@api-contract` 类型；运行时暴露 `10199` 端口并以 `Host: zh.projectcvsa.com` 做存活探测 |

`build-and-push` Job 按规划矩阵并发构建目标，使用 GitHub Actions 作用域缓存（`type=gha,scope="cvsa-$target"`），并将每个镜像同时推送为 `ghcr.io/<owner>/cvsa-<target>:sha-<12位>` 与 `:latest` 两个标签。

## Webhook 部署守护进程与 GHCR 拉取流程

当 `github.ref == 'refs/heads/main'` 且仓库变量 `ENABLE_VPS_DEPLOY == 'true'` 时，CI 向生产服务器上的 [`@cvsa/deploy`](https://github.com/project-cvsa/cvsa/blob/main/apps/deploy/src/index.ts) systemd 服务发起异步部署并轮询状态（最长等待 `900s`，每 `10s` 轮询一次 `GET /status`）：

- **鉴权与请求校验**：守护进程默认监听 `127.0.0.1:9420`（允许反代剥离 `/_deploy` 前缀）。`GET /health` 免鉴权；`POST /deploy` 与 `GET /status` 校验 `Authorization: Bearer <DEPLOY_WEBHOOK_SECRET>`（使用 `timingSafeEqual` 常量时间比较），请求体限制 `16384` 字节并由 `DeployRequestSchema` 校验。同一时间仅允许一个活跃发布，并发请求返回 HTTP `409`。
- **仓库同步与原子覆盖生成**：[`DeploymentService.execute`](https://github.com/project-cvsa/cvsa/blob/main/apps/deploy/src/deploymentService.ts) 先持久化 `.deploy.state.json`，尝试 `git pull --ff-only`（失败仅告警，不阻塞已推送镜像的拉取），随后读取现有的 `docker-compose.override.yml`，将请求服务的 `image` 更新为 `${IMAGE_REGISTRY:-ghcr.io/project-cvsa}/cvsa-<service>:<tag>` 并写入临时候选文件 `.deploy.candidate.json`。
- **配置校验、拉取与零构建切换**：依次在 `-f docker-compose.yml -f .deploy.candidate.json` 上运行：
  1. `docker compose ... config --quiet` 校验合并配置合法性；
  2. `docker compose ... pull <services...>` 从 GHCR 拉取指定 `sha-*` 标签镜像；
  3. `docker compose ... up -d --no-deps --no-build --wait --wait-timeout 180 <services...>` 仅重建并等待目标服务健康就绪，避免重启未变更的数据库或关联服务。
- **持久化状态与旧镜像清理**：发布成功后才将候选配置原子重命名为 `docker-compose.override.yml`（失败则保留旧 override 以便定位），最后调用 [`removeStaleImages`](https://github.com/project-cvsa/cvsa/blob/main/apps/deploy/src/imageCleanup.ts) 清理同一仓库下不再被任何容器引用的历史 `sha-*` 镜像。若守护进程在部署中途意外重启，`initialize()` 会在启动时将遗留的 `deploying` 状态标记为 `failed`。
