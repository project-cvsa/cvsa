---
title: 可观测性与 SigNoz 查询
description: "@cvsa/observability OpenTelemetry 初始化、@cvsa/logger 日志脱敏与链路关联、x-trace-id 透传及 SigNoz PromQL 查询。"
docType: reference
---

*Recorded 2026-11-27.* CVSA 使用 [`@cvsa/observability`](https://github.com/project-cvsa/cvsa/blob/main/packages/observability/src/init.ts) 统一接入 OpenTelemetry Traces、Metrics 与 Logs 三信号，由 [`@cvsa/logger`](https://github.com/project-cvsa/cvsa/blob/main/packages/logger/src/appLogger.ts) 将活跃 Span 上下文注入结构化日志，并在爬虫统计面板中通过 [`SigNozMetricsClient`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/stats/signozClient.ts) 查询持久化指标序列。

## OpenTelemetry 初始化与三信号导出

[`initOtelSdk`](https://github.com/project-cvsa/cvsa/blob/main/packages/observability/src/init.ts) 构建并启动 `NodeSDK`，通过环境变量或函数参数读取服务标识与 OTLP 接收端地址：

- **端点标准化**：`resolveOtlpSignalEndpoints` 读取 `OTEL_EXPORTER_OTLP_ENDPOINT`（先去除末尾斜杠与 `/v1/(traces|metrics|logs)` 后缀），随后分别派生 `${baseUrl}/v1/traces`、`${baseUrl}/v1/metrics` 与 `${baseUrl}/v1/logs` 三个 OTLP/HTTP Protobuf 导出地址。未配置端点时仅跳过对应 Exporter 注册，不向默认 `127.0.0.1:4317` 发起无效重试。
- **Resource 属性**：统一附带 `service.name`（`OTEL_SERVICE_NAME`）、`service.instance.id`（默认随机 UUID，爬虫传入持久化实例 ID）、`service.version` 与 `deployment.environment`。
- **指标导出与指数直方图**：配置指标端点时注册 `PeriodicExportingMetricReader`（导出周期 `15_000 ms`），并通过 `ObservedMetricExporter` 回调导出成功/失败与耗时至爬虫导出状态观测器；同时为 `cvsa.crawler.duration_ms` 注册 `EXPONENTIAL_HISTOGRAM` 视图（`maxSize: 2048`、`recordMinMax: true`）。
- **Span 辅助函数**：[`traceTask`](https://github.com/project-cvsa/cvsa/blob/main/packages/observability/src/tracer.ts) 开启活跃 Span，自动写入属性并在抛出异常时标记 `SpanStatusCode.ERROR` 且调用 `recordException`；[`createMetricInstruments`](https://github.com/project-cvsa/cvsa/blob/main/packages/observability/src/metrics.ts) 在全局 `MeterProvider` 变更时惰性重建仪表实例，保证测试或延迟初始化场景下指标不丢失。

## Pino 日志脱敏与 Span 上下文关联

[`appLogger`](https://github.com/project-cvsa/cvsa/blob/main/packages/logger/src/appLogger.ts) 是各应用默认的结构化日志入口，每次记录日志时会串联三条链路：

1. **环境变量上下文（[`context.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/logger/src/context.ts)）**：`withLogContext` 基于 `AsyncLocalStorage` 透传当前任务的 `jobId`、`queue`、`aid`、`bvid`、`worker`、`component` 等字段，与单次调用传入的 `attrs` 合并。
2. **凭据脱敏（[`sanitize.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/logger/src/sanitize.ts)）**：在写入任何输出前先执行深度清洗（最大递归深度 `6`）。键名归一化后包含 `password`、`passwd`、`secret`、`token`、`credential`、`apikey`、`privatekey`、`authorization`、`cookie`、`proxyurl`、`sessionid` 的字段会被替换为 `"[REDACTED]"`（对非秘密字段 `credentialAgeSec`、`sessionGen`、`buvidPrefix` 例外放行）；同时消息字符串中的 `scheme://userinfo@host` 凭据段会被掩码为 `$1***:***@`。[`pinoSetup.ts`](https://github.com/project-cvsa/cvsa/blob/main/packages/logger/src/pinoSetup.ts) 还额外配置了 `LOG_REDACT_PATHS` 作为兜底脱敏，生产环境输出 JSON，非生产环境启用 `pino-pretty`。
3. **三路同步输出与 Trace 关联**：`appLogger` 从 `trace.getActiveSpan()` 提取 `trace_id` 与 `span_id` 并合入结构化字段，随后同步写入 Pino 日志、通过 `otelLogger.emit` 发出 OpenTelemetry LogRecord，并在存在活跃 Span 时调用 `activeSpan.addEvent(message, ...)`（`error`/`fatal` 级别同步将 Span 状态置为 `ERROR`）。

## `x-trace-id` 跨端链路传播

后端与前端通过统一的响应头将请求 Trace ID 暴露给调用方与用户排障界面：

- **Elysia 服务端提取与回退（[`apps/backend/src/index.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/index.ts)、[`onAfterHandle.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/onAfterHandle.ts)、[`errorHandler.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/errorHandler.ts)）**：
  - `@elysiajs/opentelemetry` 为每个请求创建根 Span（仅当 `OTEL_EXPORTER_OTLP_ENDPOINT` 定义时注册 `OTLPTraceExporter`）。
  - CORS 显式配置 `exposeHeaders: ["x-trace-id", "X-Trace-ID"]`，确保跨域浏览器前端（`zh.` / `en.projectcvsa.com` 请求 `api.projectcvsa.com`）可读取响应头。
  - `onBeforeHandle` 与 `onError` 通过 [`getTraceId`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/common/trace.ts) 读取当前 Span 的 `traceId` 并写入响应头 `X-Trace-ID`；当没有活跃 Span（如导出关闭或测试环境）时，`resolveTraceId` 在请求级 `store.traceId` 生成 32 位无连字符 UUID 作为兜底关联键。
  - 错误响应通过 [`getErrorResponse`](https://github.com/project-cvsa/cvsa/blob/main/apps/backend/src/common/error/getErrorResponse.ts) 在 JSON 响应体中同时返回 `traceId` 字段。
- **前端 Eden Treaty 客户端提取（[`apps/web/src/lib/api/treaty.ts`](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/lib/api/treaty.ts)）**：`settle()` 在处理非成功响应时，优先从 `response.headers.get("x-trace-id")` 读取 Trace ID，若响应头缺失则回退读取错误体中的 `errorValue.traceId`，透传给 `ApiResult` 错误对象。

## SigNoz PromQL 指标与查询机制

爬虫运行时一方面将指标按分钟快照写入 TimescaleDB（`crawler_minute_metrics`），另一方面将 OTel 指标通过 OTLP 推送至可观测性后端。当环境配置了 `SIGNOZ_API_URL`（可选配 `SIGNOZ_API_KEY`）时，[`CrawlerAdminStatsService`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/stats/adminService.ts) 优先调用 [`SigNozMetricsClient.queryCrawlerSeries`](https://github.com/project-cvsa/cvsa/blob/main/apps/crawler/src/crawler/stats/signozClient.ts) 构建时间序列，并在 SigNoz 未配置或返回空数据时自动回退至数据库分钟表序列。

- **HTTP 接口与鉴权**：请求 `${SIGNOZ_API_URL}/api/v1/query_range`，传入 `query`、`start`（秒）、`end`（秒）与 `step`（`${stepSec}s`），超时默认 `5000 ms`；若提供 `SIGNOZ_API_KEY` 则附带请求头 `SIGNOZ-API-KEY`。
- **步长选择（`pickSigNozStep`）**：按查询窗口时长分段映射步长：`<= 5m` 取 `5s`，`<= 15m` 取 `15s`，`<= 30m` 取 `30s`，`<= 60m` 取 `60s`，`<= 6h` 取 `120s`，`<= 24h` 取 `300s`，更长窗口取 `1800s`。
- **查询的 PromQL 指标**：点名对应 OTel 导出至 Prometheus 兼容存储后的下划线命名规范（`.` 转换为 `_`）：

| 序列键 | PromQL 表达式 | 来源 OTel 指标 |
| :--- | :--- | :--- |
| `videosPerMin` | `sum(rate(cvsa_crawler_events{kind="videosRecorded"}[1m])) * 60` | `cvsa.crawler.events` |
| `requestsPerMin` | `sum(rate(cvsa_crawler_events{kind="httpAttemptsFinished"}[1m])) * 60` | `cvsa.crawler.events` |
| `jobsPerMin` | `sum(rate(cvsa_crawler_jobs_results[1m])) * 60` | `cvsa.crawler.jobs.results` |
| `inferencesPerMin` | `sum(rate(cvsa_crawler_events{kind="modelInferenceCalls"}[1m])) * 60` | `cvsa.crawler.events` |
| `queue.waiting` / `queue.active` | `sum(cvsa_crawler_queue_jobs{state="waiting"\|"active"})` | `cvsa.crawler.queue.jobs` |
| `tracking.overdue` | `sum(cvsa_crawler_tracking_overdue)` | `cvsa.crawler.tracking.overdue` |
| `latency.<op>.<q>` | `histogram_quantile(q, sum(rate(cvsa_crawler_duration_ms_bucket{operation="op"}[1m])) by (le))` | `cvsa.crawler.duration_ms`（`op` 为 `trackingExecution` / `httpAttempt` / `modelProcess`，`q` 为 `0.5` / `0.9` / `0.95` / `0.99`） |
