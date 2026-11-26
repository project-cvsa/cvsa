---
title: "0005: 双层视频标注策展模型与淘汰样本元数据留存"
description: 分离多人标注流水与终局收录裁决表，通过 x-user-id 透传身份，并在模型淘汰抽样时留存视频元数据以短路重复抓取。
docType: explanation
---

*Recorded 2026-11-27.* CVSA 放弃在 `discovery_sample.human_label` 单字段上直接覆盖标注状态的做法，在 `@cvsa/snapshot-db` 中拆分出 **`video_annotation`（多人标注流水）** 与 **`video_curation`（终局收录裁决）** 两张表，同时在模型淘汰并抽样时保留 `bilibili_video_metadata` 记录（`filter_decision = "rejected"`）。

## 背景与约束

1. **单字段模型无法支撑多人协作**：早期 `discovery_sample` 以 `aid` 为主键，仅用 `human_label`（`0` / `1`）与 `labeled_at` 记录人工结果。这种结构无法保存操作者身份，后一位标注员的操作会直接覆盖前一位的记录，也无法容纳“不确定（`uncertain`）”、预设 Tag 归类或复核理由等协作上下文。
2. **淘汰时删表导致界面缺信息且重复抓表**：此前模型判定拒绝后会清理基础元数据，造成两个问题：一是抽样进入人工复核队列的样本在 `ImmersiveLabeler` 中缺少封面、UP 主、发布时间、时长等上下文；二是后续搜索漫游再次扫到同一 `aid` 时，因本地没有否定记录而重复请求 Bilibili 详情接口。
3. **跨库用户体系隔离**：根据 [ADR 0001](./0001-dual-database-postgres-and-timescaledb.md)，用户表 `auth.user` 位于编目主库，而爬虫标注与元数据表位于快照库，`apps/crawler` 不应直接连接主库。

## 决策内容

1. **双层持久化模型（[packages/snapshot-db/src/schema/annotation.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/snapshot-db/src/schema/annotation.ts)）**：
   - `video_annotation`：按自增 `id` 追加记录每位标注员（`user_id`）对单个 `aid` 的独立判定（`accepted` / `rejected` / `uncertain`）、可选 `tags`（JSON 字符串数组）、`notes` 与创建时间。同一视频允许多个标注员反复贡献意见而不相互覆盖。
   - `video_curation`：以 `aid` 为主键存储终局裁决（`accepted` / `rejected` / `pending`）、裁决人 `curated_by` 与 `reason`。当状态置为 `accepted` 时联动插入 `video_tracking` 开启快照追踪；置为 `rejected` 时清理追踪任务并永久屏蔽。
2. **身份由后端网关透传**：
   - [apps/backend/src/handlers/crawler/index.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/handlers/crawler/index.ts) 在代理提交标注与策展请求时，从已认证会话中提取 `user.id` 并写入 `x-user-id` 请求头传递给 [apps/crawler/src/controlPlane/discovery.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/controlPlane/discovery.ts)，使爬虫服务保持与主库认证体系的解耦。
3. **淘汰样本保留元数据与前置短路**：
   - [DiscoveryCandidateEvaluator](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/evaluator.ts) 在模型淘汰候选视频时同样写入 `bilibili_video_metadata`（标注 `filter_decision: "rejected"` 及 `discovery_context`），并在命中 `rejectionSampleRate` 时写入 `discovery_sample`。
   - 后续发现任务在请求 Bilibili 详情接口前，按序读取 `discovery_sample.human_label === 0`、`video_curation.status === "rejected"` 与 `bilibili_video_metadata.filter_decision === "rejected"`，命中即返回 `skipped` 短路。

## 备选方案与取舍

- **备选方案：在 `discovery_sample` 上追加 JSON 数组保存标注记录**。虽然无需新建表，但 JSON 数组难以按 `user_id`、`created_at` 或 `curation.status` 建立高频分页与筛选索引，也不便独立演进裁决状态机。双表分离虽然增加了一次关联查询，但读路径可通过 `aid` 批量 `IN` 查询聚合成字典返回，开销可控。
- **代价**：`bilibili_video_metadata` 会随被拒样本持续增长（需依赖 `filter_decision` 索引与前端过滤区分正常收录视频与已知拒绝视频）。

## 影响与后续约束

- 对同一批淘汰样本保留元数据后，管理端导出的训练数据集（JSON/JSONL）能够稳定附带完整 `duration`、`ownerName`、`pubdate` 及多人 `annotations` 明细。
- 后续如果为标注员增加独立统计或按标注一致性自动晋升策展状态，可直接基于 `video_annotation` 的 `(user_id, created_at)` 与 `(aid, created_at)` 索引构建，无需改动表结构。
