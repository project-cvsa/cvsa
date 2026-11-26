---
title: 爬虫发现、标注策展与调度路线图
description: CVSA 视频发现引擎、ONNX 分类筛选、双层人工标注策展及运行时调度的当前状态与演进规划。
docType: plan
status: planned
---

*Updated 2026-11-27.* 本文档跟踪 `apps/crawler`、`packages/snapshot-db` 与前端爬虫控制台的当前实现及后续演进方向，替代早期的零散规划记录。关于双层标注模型与运行时开关的设计取舍，请分别参考 [ADR 0005](/zh/decisions/0005-dual-layer-annotation-curation) 与 [ADR 0006](/zh/decisions/0006-runtime-discovery-feature-flags)。

## 当前状态

### 1. 视频追踪与快照调度

- **分层状态机**：[policy.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/tracking/policy.ts) 与 `TrackingPolicySchema` 维护 `new`、`regular`、`milestone` 与 `archive` 四个状态：
  - 新入库视频执行密集初始采样（默认第 `1.5`、`3`、`5`、`10` 分钟），并在 `48` 小时内以较高频率追踪；2 小时后增速低于阈值则转入常规分层。
  - `regular` 状态依据日均播放增量（`DEFAULT_REGULAR_DAILY_TIERS`：0 / 6 / 24 / 96 / 192 / 兜底档）动态分配 `48h` 至 `1.5h` 不等的采样间隔。
  - 接近里程碑节点（默认预计到达时间 `<= 144h`）时进入 `milestone` 状态并在临近窗口切换为 `15s` 高频捕捉；不可用或已失效视频降级至 `archive`（默认每 `7` 天复查）。
- **并发防重入**：`video_tracking.lease_until` 充当乐观租约，BullMQ `snapshot-batch` Worker 批量拉取并写入 TimescaleDB `video_snapshot` 超表，由数据库触发器同步刷新 `latest_video_snapshot`。

### 2. 候选发现与双模式搜索漫游

- **搜索漫游 (`SearchRover`)**：支持增量模式（按 `pubdate` 倒序并结合 `10` 分钟粒度的 `discovery_search_window` 探索账本跳过已扫区间）与深度多切片模式（结合 `1 / 3 / 7 / 14 / 30` 天窗口及 `click` / `totalrank` 排序回捞历史作品）。
- **关联推荐与热门抽样**：具备基于已收录视频关联列表的推荐图谱提取（`bilibili_video_relation`）及高热视频抽样入口，当前受运行时特征开关控制。
- **元数据刷新调度**：`MetadataRefreshScheduler` 消费 `video_tracking.next_metadata_at`，在不新增独立 Redis 队列的前提下按节拍回刷视频标题、简介、Tag 等静态信息并写入 `bilibili_video_metadata_history`。

### 3. 混合筛选与 ONNX 推理

- **确定性规则与模型推理**：[DiscoveryFilterService](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/filter.ts) 优先匹配歌手白名单与曲目特征词（`whitelistSingers` + `whitelistSongIndicators`）；未命中强规则的候选视频交由受监督的本地子进程运行 ONNX 嵌入与 `akari` 多通道分类器（[akari.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/akari.ts)），按 `modelThreshold`（默认 `0.5`）裁决。
- **拒绝样本留存与短路**：被模型拒绝且命中抽样率（默认 `5%`）的候选视频同样保留完整 `bilibili_video_metadata`（`filter_decision = 'rejected'`）并写入 `discovery_sample`。`DiscoveryCandidateEvaluator` 在请求 Bilibili 详情接口前优先查询既有 `video_curation` 与拒绝记录，避免重复耗费上游配额。

### 4. 双层标注策展、补齐与导出

- **多人标注与终局裁决**：拆分为 `video_annotation`（按 `user_id` 追加的标注流水）与 `video_curation`（单视频终局裁决：`accepted` / `rejected` / `pending`），由后端代理透传 `x-user-id`。
- **管理控制台能力**：`/admin/crawler` 已提供 7 档时间窗口的 SigNoz PromQL 时序图表、队列任务明细抽屉、沉浸式单视频标注视图（支持预设 Tag 与键盘快捷键）、手动元数据补齐（`backfillMetadata`）与 JSON/JSONL 训练集导出（`exportDataset`）。

### 5. 运行时发现开关

- `CrawlerExecutionConfigSchema`（`packages/contracts`）已包含 `relatedDiscoveryEnabled`（默认 `false`）、`searchRoverEnabled`（默认 `true`）、`hotSamplingEnabled`（默认 `true`）与 `autoMetadataRefreshEnabled`（默认 `true`），并通过 `NetworkRuntimeConfigManager` 的 5 秒轮询生效。

## 演进方向

### 1. 多阶段发现漏斗（Multi-stage Discovery Pipeline）

- **现状与瓶颈**：当前 `DiscoveryFilterService` 的规则层仅覆盖白名单精确匹配（代码注释已明确保留空置黑名单与非强制时长拦截），其余候选视频在获取详情后直接送入 ONNX 分类器，上游配额与模型推理算力在噪声较高的泛搜索词下容易被无关视频消耗。
- **目标架构**：建设逐级收窄的三阶段漏斗，详见早期设计草稿 [多阶段发现启发式筛选备忘](/zh/ideas/multi-stage-discovery-heuristics)：
  1. **分区 (`tid` / `tid_v2`) 过滤与先验权重层**：利用搜索结果自带的分区字段做前置阻断或概率偏置，低相关性分区直接拦截，无需额外请求详情接口。
  2. **结构化词库与分词快车道**：对标题与 Tag 进行规范化分词，识别合成音引擎、声库别名及翻唱/原创/调教指示词组合，划分高置信直通通道与明确非曲目拦截通道。
  3. **阈值三分流（Confidence Triage）**：结合规则先验与 `akari` 概率区间，将候选视频分流为自动收录、自动拒绝以及边界不确定样本（集中送入 `pending` 人工复核队列与训练集主动学习）。

### 2. 自动元数据补漏调度

- **现状**：当前仅提供管理端手动触发的 `POST /v2/admin/crawler/discovery/samples/metadata/backfill` 接口，单次拉取受限且依赖人工发起。
- **规划**：基于 `listIncompleteMetadataAids` 的存量统计，在后台增加低优先级、严格限速的定时补偿任务，并配备一次性历史拒绝样本元数据回填脚本，确保旧版记录均补齐 `cid`、`duration` 与 `tags` 字段以支撑模型迭代训练。

### 3. 控制面功能补齐与权限细化

- **前端运行时开关暴露**：在 [CrawlerExecutionPolicy.tsx](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/components/pages/admin/crawler/settings/CrawlerExecutionPolicy.tsx) 中补全 4 个发现/刷新布尔开关的 UI 控件，使运营人员无需直接编辑 JSON 即可通过表单切换开关。
- **全量数据集游标导出与 `uncertain` 对齐**：解除 `exportDataset` 对 `listSamples` 单页 200 条上限的依赖，改为分页游标遍历全量已标注样本；统一前端 `[U]` 不确定快捷键与后端 `decision: "uncertain"` -> `curationStatus: "pending"` 的语义，避免误标为否定样本。
- **代理路由权限分层**：将 `apps/backend/src/handlers/crawler/index.ts` 的单一 `adminAuthMiddleware` 拆分为只读/标注策展接口（允许 `editor`）与调度/网络配置写入接口（仅限 `OWNER` 与 `admin`）。
