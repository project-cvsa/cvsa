---
title: "0006: 发现与调度开关收敛至运行时执行配置"
description: 将静态编译期发现开关迁移至 CrawlerExecutionConfig，借助 NetworkRuntimeConfigManager 实现持久化、乐观锁校验与 5 秒热更新。
docType: explanation
---

*Recorded 2026-11-27.* 我们将原本硬编码在 [apps/crawler/src/crawler/discovery/flags.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/flags.ts) 中的静态发现开关升级为可持久化、可热更新的运行时开关，直接挂载到 `CrawlerExecutionConfigSchema`（持久化于 `network_runtime_config` 表），而不再新建独立配置表或依赖必须重启容器才生效的环境变量。

## 背景与约束

1. **静态常量导致启停成本过高**：此前 `RELATED_DISCOVERY_ENABLED = false` 为代码级静态常量，且 `DiscoveryScheduler`、`DiscoveryPipelineProcessor` 与 `DiscoveryService` 在构造时将开关值缓存为只读字段。每当需要临时开启/关闭关联视频扩展、搜索漫游、热门抽样或自动元数据刷新时，都需要修改代码、重新构建 Docker 镜像并重启爬虫容器。
2. **已有完整的运行时配置广播链**：`apps/crawler` 的 [NetworkRuntimeConfigManager](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/network/config.ts) 已经成熟实现了基于 `revision` 乐观锁的读写、`5` 秒间隔定时拉取、Zod 校验防退化（配置不合法时保留上一有效修订）以及 `onExecutionChange` 监听器，并与控制台 `GET/PUT /v2/admin/crawler/config/network` 完全打通。

## 决策内容

1. **扩展 `CrawlerExecutionConfigSchema`（[packages/contracts/src/crawler.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler.ts)）**：
   - 在 `execution` 对象下新增 4 个附带默认值的布尔字段：`relatedDiscoveryEnabled`（默认 `false`）、`searchRoverEnabled`（默认 `true`）、`hotSamplingEnabled`（默认 `true`）与 `autoMetadataRefreshEnabled`（默认 `true`）。
   - 所有新增字段均声明 Zod `.default(...)`，保证数据库里已存盘的旧版 JSON 配置文档反序列化时自动补全默认值，不会引发解析异常。
2. **去静态化、改用实时读取器（Live Getter）注入（[apps/crawler/src/container.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/container.ts)）**：
   - 各调度器、流水线处理器与 `MetadataRefreshScheduler` 改为接收函数形参（如 `() => networkRuntime.getExecutionConfig().autoMetadataRefreshEnabled`），在每次任务触发或回调执行前读取最新值。
3. **启动全量注册 BullMQ 重复任务、执行期按开关跳过（[apps/crawler/src/crawler/discovery/scheduler.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/scheduler.ts)）**：
   - `startScheduledSweeps` 在进程启动时统一向 BullMQ 注册 `repeatable-search-sweep`、`repeatable-deep-sweep` 与 `repeatable-hot-sample` 三个周期任务；当某个开关被关闭时，触发入口与 Worker 处理器立即跳过并返回，重新打开后无需重启爬虫进程即可在下个周期恢复运行。

## 备选方案与取舍

- **备选方案一：写入 `crawler_runtime_config` 表的独立 Key（如 `discovery` 配置文档）**：虽然在语义上属于发现域，但该存储路径此前没有内置 `5` 秒轮询广播链和 `revision` 并发保护。复用 `CrawlerExecutionConfig` 能够以零额外基础设施成本复用同一套版本控制、错误回退与权限路由。
- **备选方案二：使用环境变量控制开关**：切换开关需要修改宿主机 `.env` 并重建或重启容器，会中断正在运行的 BullMQ 抓取任务与 Bilibili 会话态。

## 影响与后续约束

- 所有爬虫运行时开关均在最多 `5` 秒内生效（由 `NetworkRuntimeConfigManager.startPolling(5_000)` 驱动），控制面持久化更新时自带乐观锁 `revision` 防止多人编辑相互覆盖。
- 后续若需把上述 4 个发现开关暴露给 Web 表单交互，只需在 [CrawlerExecutionPolicy.tsx](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/components/pages/admin/crawler/settings/CrawlerExecutionPolicy.tsx) 添加对应的开关控件并透传给同一份 `execution` 对象即可，后端无需任何新增接口。
