# @cvsa/crawler

The Bilibili data collection daemon and control plane for CVSA. It tracks video metrics, ingests historical milestone snapshots into TimescaleDB, and discovers new singing voice synthesis videos using the in-process Akari classifier.

## Architecture

- **Crawler Engine (`src/crawler/`)**: Video tracking queues (BullMQ + Redis), milestone rate estimation, snapshot ingestion, and discovery crawlers.
- **Classifier (`src/ml/`)**: In-process ONNX Runtime model (`akari`) evaluated against HuggingFace tokenizer embeddings.
- **Control Plane (`src/controlPlane/`)**: Elysia HTTP service exposing runtime metrics, network adapter policies, and manual tracking triggers.

## Development

```bash
# Start crawler daemon in watch mode
bun dev

# Run unit and integration tests
bun test
```

## Environment

| Variable | Description |
| --- | --- |
| `SNAPSHOT_DATABASE_URL` | TimescaleDB connection string (defaults to `cvsa_snapshot`) |
| `REDIS_URL` | Redis instance for scheduling queues and rate limiters |
| `CONTROL_API_TOKEN` | Bearer token required to access the control plane API |
| `CONTROL_API_PORT` | Port for the control plane (default `16413`) |
| `CRAWLER_MODEL_DIR` | Directory containing ONNX models (`./model`) |

### 网络限流与任务恢复

在管理面板 `/admin/crawler` 的网络配置中编辑 adapter 发包速率和窗口预算；
“执行与退避策略”配置快照/发现并发、任务执行期限、HTTP 超时、本地额度等待上限、
上游退避及随机时间、暂停范围与快照队列容量。保存后写入持久化配置，并更新运行中的
worker，无需重启。减小并发不打断正在执行的任务。

本地额度不足时按令牌恢复时间等待；等待超过上限后按实际等待时间延迟任务。
Redis 原子检查所有 adapter 窗口、平滑发包及预留预算，拒绝时不扣减任何额度。
上游限流使用独立状态，默认仅暂停本次使用的 adapter，也可在面板选择全部 B 站请求。
更长的 Retry-After 优先，面板显示暂停范围、剩余时间及恢复时间。

Discovery 延迟不消耗失败重试次数。搜索每页处理并保存 offset 后继续，恢复时跳过
已完成页面。客户端合并并发的凭证初始化请求，UA 在同一客户端会话内保持一致。
Snapshot 批次携带数据库租约时间；写回与释放校验同一租约，过期任务不能覆盖新租约。
普通失败由 Dispatcher 重新调度，快照队列不再同时进行 BullMQ 自动重试。

任务期限默认 120 秒，超时释放 worker 槽位、中止 HTTP，并禁止过期任务继续提交
后续数据库操作或入队。已经提交给数据库的操作不会回滚；未释放的快照租约在到期后恢复。
HTTP 默认 8 秒，任务执行期限最多 4 分钟，低于当前 5 分钟租约。
