---
title: 搜索同步、向量服务与 ONNX 分类
description: PostgreSQL 到 Meilisearch 的事务性 Outbox 同步、apps/embedding 向量服务以及爬虫隔离子进程 akari ONNX 分类流水线。
docType: reference
---

*Recorded 2026-11-27.* CVSA 的搜索与语义分类围绕两条独立运行时流水线展开：面向目录库全文与混合搜索的「PostgreSQL Outbox → BullMQ → `apps/embedding` → Meilisearch」异步索引链路，以及面向爬虫候选视频识别的「规则过滤 + 隔离子进程 `akari` ONNX 推理」链路。

## PostgreSQL 到 Meilisearch Outbox 同步

所有目录实体（`song`、`artist`、`singer`、`artistRole` 等）的写入通过 `@cvsa/catalog` 在数据库事务内同步落库变更事件，由 `apps/backend` 异步投递至 Meilisearch：

1. **事务内追加事件**：[`recordOutboxEvent`](https://github.com/project-cvsa/cvsa/blob/main/packages/catalog/src/outbox/CatalogOutbox.ts) 在业务写入事务 `tx` 内向 `meta.outbox` 插入 `status = "PENDING"` 的事件记录（如 [`SongWriter`](https://github.com/project-cvsa/cvsa/blob/main/packages/catalog/src/song/SongWriter.ts) 写入的 `song.created` / `song.updated` / `song.deleted`），保证业务数据与待同步事件同事务提交。
2. **轮询投递与 BullMQ 重试**：[`apps/backend/src/index.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/index.ts) 启动时及每 `5_000 ms` 执行 `outboxService.recoverStaleEntries()`，从 `meta.outbox` 捞取到期的 `PENDING`、`FAILED` 或租约过期（`PROCESSING` 且 `nextRetryAt <= now`）的条目推入 Redis BullMQ `outbox` 队列（[`queue.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/outbox/queue.ts)，Worker 并发 `5`）。
3. **状态机与退避**：[`OutboxService.processEntry`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/outbox/service.ts) 先调用 `markProcessing` 设置 `5` 分钟租约；执行成功标记 `PROCESSED`；失败时按 `min(60_000, 1000 * 2 ** nextRetries)` 退避更新 `nextRetryAt` 并重抛错误，达到 `MAX_RETRIES = 5` 次后标记 `FAILED` 并延迟 `3600_000 ms`（1 小时）再纳入下一轮恢复。对于未注册索引的聚合类型，[`createOutboxProcessor`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/outbox/processor.ts) 直接确认完成，不消耗重试次数。
4. **按语言分片索引与配置同步**：[`ISearchService.sync`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/search/interface.ts) 按实体的 `localizedNames`、`localizedDescriptions` 与主 `language` 收集语言集合，维护 `{entityType}_{language}` 格式的多语言索引（如 `song_zh-CN`），自动清理已移除语言的旧文档；若实体已被删除或不存在，则从该实体的所有多语言索引中删除对应 ID。[`SearchManager`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/search/manager.ts) 初始化时自动拉取并创建 Admin / Search 只读密钥，并在启动时按 [`INDEX_SETTINGS`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/search/config.ts) 同步索引设置与 `userProvided`（256 维）向量 embedder 配置。
5. **混合搜索参数**：`ISearchService.search` 先请求 `apps/embedding` 生成查询向量；若成功获得非空向量，则以 `embedder: "potion-multilingual-128M"` 与 `semanticRatio: 0.25` 发起 Meilisearch 混合搜索。

## `apps/embedding` 向量 REST 服务

[`apps/embedding`](https://github.com/project-cvsa/cvsa/blob/main/apps/embedding/src/index.ts) 是独立运行的 Elysia HTTP 服务（默认监听 `0.0.0.0:14900`），供 `apps/backend` 通过类型安全的 Eden Treaty 客户端（[`@embedding-contract`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/search/container.ts)）调用，不直接暴露给公网。

- **模型与产物加载**：[`EmbeddingManager`](https://github.com/project-cvsa/cvsa/blob/main/apps/embedding/src/embedding.ts) 使用 HuggingFace 模型 `alikia2x/potion-multilingual-128M-int8-strip`（256 维多语言静态嵌入模型）。启动时确认 `${EMBEDDING_MODEL_DIR}/potion-strip/model.onnx`（默认 `model/potion-strip/model.onnx`）是否存在，若缺失则通过 `@huggingface/hub` 下载 `onnx/model.onnx`，并通过 `AutoTokenizer.from_pretrained` 加载分词器与 ONNX Runtime `InferenceSession`。
- **前向推理结构**：模型采用静态词袋/偏移输入格式，将批量文本分词后展平为一维 `input_ids`（`int64`）与每条文本起始偏移 `offsets`（`int64`），输出维度为 `[batch, 256]` 的 `Float16Array` 并转换为二维 `number[][]`。
- **HTTP 接口**：
  - `GET /health`：返回 `{ status: "ok" | "degraded" }`（模型初始化失败时服务仍可启动但返回 `degraded`）。
  - `POST /embeddings`：接收 `{ texts: string[] }`（Zod 校验来自 `@cvsa/contracts` 的 `EmbeddingRequestSchema`），成功返回 `{ embeddings: number[][] }`（200），未就绪时返回 `{ message: "cannot generate embedding" }`（500）。

## 爬虫 ONNX `akari` 歌曲分类流水线

候选视频在通过 [`DiscoveryFilterService`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/filter.ts) 的确定性白名单后，进入本地 ONNX 分类模型筛选：

1. **三通道文本与双模型结构（[`akari.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/akari.ts)、[`const.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/const.ts)）**：
   - 将候选视频的标题（缺失填 `"untitled"`）、简介（缺失填 `"N/A"`）与空格拼接后的标签串（缺失填 `"empty"`）作为固定三通道输入。
   - 使用 `alikia2x/jina-embedding-v3-m2v-1024` 分词器（由 `@huggingface/transformers` 缓存至 `HF_HOME`）与 `${CRAWLER_MODEL_DIR}/embedding/model.onnx` 生成 3 × 1024 维特征张量（`[1, 3, 1024]` `float32`）。
   - 将特征送入 `${CRAWLER_MODEL_DIR}/akari/<version>.onnx`（默认 `AKARI_MODEL_VERSION = "3.17"`，持久化标签记为 `akari-3.17`），对输出 logits 做 `softmax` 后取 `songProbability = clamp(1 - P(label = 0), 0, 1)`，与 `modelThreshold`（默认 `0.5`）比较决定接收或拒绝。
2. **隔离子进程与强杀恢复（[`isolatedAkari.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/isolatedAkari.ts)、[`akariWorker.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/akariWorker.ts)）**：
   - 为避免 `onnxruntime-node` 原生推理卡死或发生内存泄漏影响主事件循环，[`IsolatedAkariClassifier`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/isolatedAkari.ts) 通过 `child_process.fork` 拉起单worker IPC 子进程，并通过 Promise 链串行化推理请求。
   - 子进程支持 `classify` 与 `health` 两类 IPC 消息；单次推理受 `inferenceTimeoutMs`（默认 `30_000 ms`）与任务取消 `AbortSignal` 约束。超时或任务取消时立即发送 `SIGKILL` 终止子进程并上报 `timeoutTermination` / `cancelTermination` 生命周期事件，后续请求按需重新拉起新子进程。
3. **缺省模型降级策略**：若磁盘尚未部署 ONNX 文件，[`LocalAkariClassifier.init`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/ml/akari.ts) 返回 `false`（健康状态为 `degraded`），[`DiscoveryFilterService`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/filter.ts) 将候选标记为 `model_unavailable`（若命中歌手白名单则保守接收并置 `filterDecision = "pending"`），保证爬虫在无模型文件时仍可继续运行而不抛出致命错误。
