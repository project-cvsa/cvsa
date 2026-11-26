---
title: Bilibili 接口与网络调度
description: Bilibili Web 接口签名、请求头与凭据管理、错误码分类语义，以及 @cvsa/network-scheduler 的多适配器调度机制。
docType: reference
---

*Recorded 2026-11-27.* [`BilibiliClient`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) 与 [`BilibiliSession`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/session.ts) 封装了对 Bilibili Web 接口的访问，并通过 [`NetworkRuntimeConfigManager`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/network/config.ts) 接入 [`@cvsa/network-scheduler`](https://github.com/project-cvsa/cvsa/blob/main/packages/network-scheduler/src/scheduler.ts) 的出口调度与限流层。

## 使用的接口端点与请求用途

`BilibiliClient` 通过 `requestContext` 注入用途标签（`bilibili:tracking`、`bilibili:search`、`bilibili:details`、`bilibili:credentials`、`bilibili:diagnostic`），以便网络调度层按用途绑定出口适配器与限流策略。

| 用途标识 | 接口路径 | 签名方式 | 主要调用方 | 源码位置 |
| :--- | :--- | :--- | :--- | :--- |
| `bilibili:details` | `/x/web-interface/wbi/view/detail` | WBI (`w_rid`, `wts`) | 候选详情拉取与元数据刷新 | [`client.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) |
| `bilibili:details`（公共视图） | `/x/web-interface/view` | 无签名 | 无凭据基础信息读取 | [`client.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) |
| `bilibili:search` | `/x/web-interface/wbi/search/type` | WBI + `qv_id` | `SearchRover` 关键词扫掠 | [`client.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) |
| `bilibili:search` | `/x/polymer/web-dynamic/v1/feed/topic` | 无签名 | 话题动态流获取 | [`client.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) |
| `bilibili:details` / `tracking` | `/x/web-interface/archive/related` | 无签名 | 关联视频推荐扩展（最多 40 条） | [`client.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) |
| `bilibili:tracking` | `/medialist/gateway/base/resource/infos` | 无签名 | `SnapshotService` 批量统计抓取（每批最多 30 个 `aid`） | [`client.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/client.ts) |
| `bilibili:diagnostic` | `/x/web-interface/nav` | 无签名 | 适配器连通性诊断 | [`session.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/session.ts) |

## WBI 签名、设备凭据与浏览器请求头

[`BilibiliSession`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/session.ts) 在启动时按固定三步握手获取匿名设备凭据与 WBI 密钥，并写入缓存键 `cvsa:bilibili:credential-bundle:v3`：

1. 请求 `/x/frontend/finger/spi` 获取 `buvid3` 与 `buvid4`。
2. 对 `https://www.bilibili.com/` 发起 `HEAD` 请求并携带 `buvid3`/`buvid4` Cookie，从响应 `Set-Cookie` 提取 `b_nut`（缺失时回退为当前 Unix 秒级时间戳）。
3. 使用 HMAC-SHA256 签名请求 `/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket`（`key_id=ec02`、`context[ts]`），取得 `bili_ticket` 以及 `nav.img` / `nav.sub` 两个 32 位十六进制 WBI key。

凭据有效期取 `refreshedAt + refreshIntervalMs`（默认 1 小时）与下一个东八区午夜（UTC+8 00:00）两者中的较早时间，防止跨日 WBI key 失效。每次 `signedRequest` 调用 [`signWbiQuery`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/signing.ts)，按 `MIXIN_KEY_ENCODE_TABLE` 重排拼接后的 `imgKey + subKey` 前 32 位作为 mixin key，对字典序排序并过滤 `!'()*` 字符的查询参数附加 `wts` 后计算 MD5 得到 `w_rid`。

请求头由 [`browserHeaders.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/browserHeaders.ts) 借助 `header-generator` 生成桌面端 Chrome/Edge/Safari 指纹，补全非 Safari 浏览器的 `sec-ch-ua*` Client Hints，并根据目标 URL 与 `Origin`/`Referer` 自动计算 `Sec-Fetch-Site`（`same-origin` / `same-site` / `cross-site` / `none`）、`Sec-Fetch-Mode`、`Sec-Fetch-Dest`、`Priority` 与最终头顺序。若触发 `BilibiliSessionConfig.recoveryCodes` 或消息中包含 `wbi`、`w_rid`、`bili_ticket`、`buvid`，`recover()` 会自动刷新凭据后重放一次逻辑请求。

## 错误码分类与失效视频处理

Bilibili 对业务失败与部分风控拦截同样返回 HTTP 200 并在 JSON 包络 `{ code, message, data }` 中给出非零 `code`，同时在激进风控时返回 HTTP 412。CVSA 将「出口网络或风控故障」与「稿件自身失效」严格拆开处理：

1. **传输与风控层（[`bilibiliClassifier.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/network/bilibiliClassifier.ts)）**：
   - HTTP 412 与响应体业务码 `-352`（风控校验失败）、`-412`（请求被拦截）、`-509` / `-799`（请求过于频繁）归类为 `APPLICATION_RATE_LIMIT`；HTTP 429 归类为 `HTTP_429`。
   - [`NetworkRuntimeConfigManager.execute`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/network/config.ts) 收到 `RATE_LIMITED`、`HTTP_429`、`APPLICATION_RATE_LIMIT` 或 `retryReason === "network_recovery"` 时，解析 `Retry-After` 头或响应延时并抛出 `RetryLaterError`，任务延迟重入队列而不消耗失败重试次数。
   - HTTP 4xx/5xx 之外的业务错误码（以及未收录的未知非零码）统一归类为 `APPLICATION_ERROR`。`APPLICATION_ERROR` 既不在同一次调用内换适配器重试，也不扣减适配器健康度，防止单个失效稿件拖垮健康出口或引发重试风暴。
2. **业务语义层（[`errors.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/bilibili/errors.ts) 与 [`evaluator.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/evaluator.ts)）**：
   - `-404`（视频不存在）与 `62004`（稿件审核中）归类为 `deleted`；`-403`（访问权限不足）、`62002`（稿件不可见）、`62012`（仅 UP 主自己可见）归类为 `private`。两者均为终态失效（`isTerminalVideoFailure`）。
   - 候选发现或批量统计中遇到终态失效时，更新 `video_metadata.video_status`（触发 `status_changed` 历史记录）并将 `video_tracking` 迁移至 `archive` 状态按归档周期低频复查，停止高频重试；而限流错误通过 `RetryLaterError` 原样向上抛出以触发退避。

## 搜索摘要与详情接口的数据差距

[`SearchRover`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/searchRover.ts) 调用 `/x/web-interface/wbi/search/type` 得到的 `SearchVideo` 对象仅包含搜索摘要字段：

- **缺少结构化字段**：摘要结果中的 `title` 与 `description` 可能夹带 `<em class="keyword">` 高亮标签（需剥离 HTML 标签）；`tag` 为逗号分隔字符串而非带 `tag_id` / `music_id` 的结构化 `Tags` 数组；`duration` 为 `"MM:SS"` 文本而非整秒数；缺少首分 P 的 `cid`、多 P `pages` 列表、`desc_v2` 提及信息、`staff` 联合投稿人、`rights`、`honor_reply` 与精确 `ctime`。
- **必须经由详情接口补全**：所有经搜索发现的候选视频均需通过 [`DiscoveryCandidateEvaluator`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/evaluator.ts) 调用 `getVideoDetails`（`/x/web-interface/wbi/view/detail`），才能进入规则筛选、`akari` ONNX 分类与 [`toMetadataInput`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/discovery/metadata.ts) 元数据落库。
- **已知拒绝状态短路**：为减少重复详情请求配额消耗，evaluator 在请求详情前依次查询样本表 `humanLabel === 0`、人工策展表 `curation.status === "rejected"`、元数据表 `filterDecision === "rejected"` 以及已在追踪中的记录，命中即直接跳过。

## 多适配器调度与限流策略

[`NetworkScheduler`](https://github.com/project-cvsa/cvsa/blob/main/packages/network-scheduler/src/scheduler.ts) 根据 `NetworkRuntimeConfig` 调度直连（`direct`）与 HTTP 代理（`http-proxy`）出口池：

- **用途绑定与旧配置兼容**：[`normalizeBilibiliRuntimeConfig`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/network/policy.ts) 会将旧的通用 `bilibili-api` 绑定展开至全部五个 `BILIBILI_REQUEST_TYPES` 用途；若请求的类型未在 `bindings` 中声明，调度器直接抛出 `NO_AVAILABLE_ADAPTER`（503）。
- **按权重抽样与 Redis 令牌桶**：候选池按 `Math.max(0.1, config.baseWeight)` 进行加权随机抽样，并通过 [`RedisRateLimiter`](https://github.com/project-cvsa/cvsa/blob/main/packages/network-scheduler/src/rateLimiter.ts) 的 Lua 脚本 `acquireBudgets` 原子扣减该适配器每秒默认上限（`requestsPerSecond ?? 20`）以及所有自定义 `rateLimits` 窗口（键前缀 `cvsa:crawler:network-rate:<durationSeconds>:<maxRequests>:adapter:<id>`）。若所有候选均被令牌桶拒绝，调度器返回 `RATE_LIMITED`（429）并携带最小 `retryAfterMs`（`retryReason: "local_capacity"`）。
- **可重试错误故障转移**：当响应为 `NETWORK_FAILURE`、`REQUEST_TIMEOUT` 或 `HTTP_5XX`（`RETRYABLE_NETWORK_ERROR_CODES`）且请求方法为 `GET`/`HEAD` 或显式设置 `replaySafe: true` 时，调度器自动在同一请求内继续尝试候选池中的下一个适配器。
- **软预留与自适应配置边界**：`@cvsa/contracts` 的 [`SoftReservePolicySchema`](https://github.com/project-cvsa/cvsa/blob/main/packages/contracts/src/crawler.ts) 与 `NetworkRuntimeConfigSchema` 已定义并校验按 `requestTypePolicies` 分配的 `reservedShare`（总和不得超过 `1`）以及 `AdaptiveRateConfigSchema`、`HealthConfigSchema`。在当前运行时中，[`container.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/container.ts) 实际启用的策略为适配器级 `rateLimits` 令牌桶与故障转移，`healthFactor`、`adaptiveFactor` 与 `reservedShare` 在状态接口中返回 `null` 供后续扩展使用。
