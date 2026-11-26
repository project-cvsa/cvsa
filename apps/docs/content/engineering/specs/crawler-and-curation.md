---
title: 爬虫发现、策展与追踪规约
description: Bilibili 视频发现筛选流程、运行时开关、双层标注策展、时序追踪状态机与里程碑回溯机制。
docType: reference
---

`apps/crawler` 将候选视频发现、人工标注与策展、时序快照调度与里程碑追踪统一在同一套持久化状态机与运行时配置体系中，数据存储在 `@cvsa/snapshot-db`（TimescaleDB）并由 BullMQ 驱动任务执行。

## 视频发现与筛选流水线

### 发现渠道

候选视频通过 `DiscoveryOriginChannelSchema` 定义的渠道进入发现流程：

- `search`：Search Rover 按关键词与时间窗口执行增量或深度搜索巡检。
- `related`：基于已追踪或种子视频拉取 Bilibili 相关推荐列表并记录关联边（`bilibili_video_relation`）。
- `manual`：运维或编目人员通过控制台触发单条详情拉取或手动摄入。
- `graph`：通过 `/discovery/graph/:identifier` 交互式查询或拓展推荐关联图。
- 此外，定时任务支持对近期热门投稿执行 `hot_sample` 采样。

### 单视频判断顺序 (`DiscoveryCandidateEvaluator`)

所有自动与手动发现候选都经由 [`DiscoveryCandidateEvaluator`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/evaluator.ts) 统一处理，避免手动入口绕过筛选规则直接污染追踪表：

1. **前置跳过判断**（未传 `force: true` 时）：若 `discovery_sample.human_label === 0` 或 `video_curation.status === "rejected"`，直接返回 `human_rejected`；若 `bilibili_video_metadata.filter_decision === "rejected"`，返回 `already_rejected`；若已在 `video_tracking` 中，返回 `already_tracked`。
2. **拉取完整详情**：调用 Bilibili 详情接口；若返回删除、下架等终端状态，更新 `bilibili_video_metadata.video_status`（并写入元数据变更历史），同时将已有追踪行转入 `archive`。
3. **规则与模型筛选 (`DiscoveryFilterService`)**：
   - 优先执行确定性白名单匹配：当标题或标签命中 `whitelistSingers`，且同时命中 `whitelistSongIndicators` 或 `vocaloid中文曲` / `synthesizer v` / `vocaloid` 标签时，直接以 `whitelist_hit` 接收（`confidence = 1.0`）。当前版本已移除硬编码黑名单与时长一刀切拦截，未命中白名单的候选交由模型判断。
   - 若启用 `modelEnabled` 且分类器可达，调用受控子进程托管的 ONNX `akari` 分类器，当 `songProbability >= modelThreshold`（默认 `0.5`）时接收（`model_hit`），否则拒绝（`model_rejected`）。
   - 若模型不可达或未启用，回退至仅歌手命中启发式规则并标记 `model_unavailable`（模型不可用时元数据写入 `filterDecision = "pending"`）。
4. **元数据与样本留存**：
   - 被接收候选写入 `bilibili_video_metadata`（`filterDecision = "accepted"`）与 `discovery_sample`，再次确认无并发产生的人工拒绝标记后，写入 `video_tracking`（初始状态 `new`）。
   - 被拒绝候选同样保留元数据（`filterDecision = "rejected"`）以便复用并避免重复请求上游；同时按 `rejectionSampleRate`（默认 `0.05`）随机抽样写入 `discovery_sample` 供后续人工标注重训模型。

## 运行时发现与执行开关

`CrawlerExecutionConfigSchema`（嵌套于 `NetworkRuntimeConfigSchema`）通过 `NetworkRuntimeConfigManager` 管理并支持热更新与 5 秒轮询同步：

| 配置字段 | 默认值 | 控制行为 |
| :--- | :--- | :--- |
| `relatedDiscoveryEnabled` | `false` | 控制是否拉取相关视频推荐接口并写入关联边与候选。 |
| `searchRoverEnabled` | `true` | 控制自动搜索巡检定时调度是否运行。 |
| `hotSamplingEnabled` | `true` | 控制热门候选定时采样是否启用。 |
| `autoMetadataRefreshEnabled` | `true` | 控制 `MetadataRefreshScheduler` 是否消费到期的 `next_metadata_at` 刷新元数据。 |
| `snapshotConcurrency` / `discoveryConcurrency` | `25` / `12` | 动态调整快照批处理 Worker 与发现 Worker 并发度。 |
| `queueCap` | `200` | 追踪调度器每轮向 BullMQ 派发的上限。 |
| `requestTimeoutMs` / `taskTimeoutMs` | `8000` / `120000` | 上游 HTTP 请求超时与单任务执行超时上限。 |

## 双层标注与策展体系

为了分离多人协作意见与最终入库裁决，系统在 `@cvsa/snapshot-db` 中维护两张表与对应服务方法（见 [`DiscoveryAdminService`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/adminService.ts)）：

- **标注层 (`video_annotation`)**：允许多个标注员针对同一 `aid` 追加独立的标注记录，包含 `decision`（`"accepted" | "rejected" | "uncertain"`）、可选 `tags` 与 `notes`，互不覆盖。
- **策展层 (`video_curation`)**：每个 `aid` 维护一条权威裁决，包含 `status`（`"accepted" | "rejected" | "pending"`）、`curatedBy` 与 `reason`。
  - 裁决为 `accepted` 时，将 `discovery_sample.human_label` 设为 `1`，并在缺少追踪记录时自动以 `state: "new"` 加入 `video_tracking`。
  - 裁决为 `rejected`（或从追踪列表执行 `untrack`）时，将 `human_label` 设为 `0` 并删除 `video_tracking` 记录，防止后续发现作业重新纳入该视频。
- **操作人传递**：`apps/backend` 的 `crawlerAdminHandler` 从当前已认证会话中提取 `user.id`，通过 `x-user-id` 请求头透传至 `apps/crawler` 控制面写入 `userId` 与 `curatedBy`。
- **补齐与训练集导出**：`POST /v2/discovery/samples/metadata/backfill` 为缺少完整详情的样本或追踪视频补齐元数据；`GET /v2/discovery/samples/dataset/export` 支持按 `format`（`jsonl` / `json`）、`minProbability` 与 `status`（`all` / `accepted` / `rejected`）导出带标注上下文的训练数据集。

## 时序快照追踪状态机与里程碑

`video_tracking` 表以 `lease_until` 作为乐观锁，确保同一视频不会被多个 Worker 并发采集。追踪行在以下四种状态间流转（默认策略见 [`policies.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler/policies.ts)）：

1. **`new`**：新入库曲目默认在投稿后进行密集初始采样（默认第 `1.5`、`3`、`5`、`10` 分钟节点），最长持续 `newMaxAgeHours`（`48` 小时）；若发布满 2 小时后增速低于 `newMinVelocityAfter2h`（`10` 播放/小时），提前转入 `regular`。
2. **`regular`**：根据计算得到的播放增速按 `DEFAULT_REGULAR_DAILY_TIERS` 分档调度，间隔从 `1.5` 小时至 `48` 小时不等。当某视频接近下一个播放量里程碑且预估到达时间 `etaHours <= milestoneMaxEtaHours`（`144` 小时），或由管理员手动提权时转入 `milestone`。
3. **`milestone`**：在里程碑到达前 `milestoneCaptureLeadMs`（`180000` ms，即 3 分钟）进入高频采样窗口，以 `milestoneCaptureIntervalMs`（`15000` ms）加密抓取以锁定精确达成时刻；达成后回落至 `regular`。
4. **`archive`**：长期低活跃或已失效（删除/隐藏）视频，按 `archiveIntervalDays`（`7` 天）低频复查。

`MilestoneService` 同时提供历史里程碑导入（`POST /milestones/records`）、存量快照里程碑恢复任务（`POST /milestones/recoveries`）、策略回测（`POST /milestones/backtests`）与 Bilibili 播放量缓存刷新窗口分析（`POST /milestones/cache-window-analyses`）。
