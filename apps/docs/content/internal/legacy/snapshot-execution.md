---
title: 快照执行与错误处理
description: 快照任务的执行流程、批量处理与错误恢复机制
---

快照执行系统负责实际从B站获取视频数据并写入数据库。

## 快照类型与执行方式

| 类型          | Worker        | 执行方式        | 优先级    |
| ------------- | ------------- | --------------- | --------- |
| **new**       | snapshotVideo | 单视频          | 1（最高） |
| **milestone** | snapshotVideo | 单视频          | 1         |
| **normal**    | bulkSnapshot  | 批量（30条/组） | 3         |
| **archive**   | bulkSnapshot  | 批量            | 2         |

## 单视频快照（snapshotVideo）

**触发时机**：每秒扫描发现到期的 new/milestone 类型调度

**执行流程**：

1. 接收任务 `{ id, aid, type }`
2. 检查调度是否存在 `snapshotScheduleExists(id)`
3. 检查视频状态 `getBiliVideoStatus(aid)`
   - status ≠ 0 → 跳过，标记为 bili_error
4. 设置状态为 processing
5. 调用 `takeVideoSnapshot(sql, aid, task)`：
   - 通过 `NetworkDelegate` 请求B站API
   - 写入 `video_snapshot`
6. 设置状态为 completed

**new类型后续处理**：

- 计算 `views/hour` 速度
- 发布时间 < 48小时 且 速度 > 10/小时 → 继续调度 "new"
- 否则停止，等待常规调度

**milestone类型后续处理**：

- 检查是否已达成成就
- 已达成 → 停止，等待常规调度
- 未达成 → 重新计算ETA并调度下一次

## 批量快照（bulkSnapshot）

**触发时机**：每15秒扫描到期的 normal/archive 类型调度

**执行流程**：

1. `bulkSnapshotTickWorker` 获取最多1000条到期调度
2. 按30条/组分批处理
3. 检查每批调度是否仍存在
4. 调用 `bulkGetVideoStats(aids)` 批量获取数据
5. 对每条视频：
   - 计算速度 → 更新 `eta` 表
   - 写入 `video_snapshot`
6. 批量设置状态为 completed
7. 对 normal 类型 → 调度下一次常规快照

## 错误处理

### 代理不可用（NO_PROXY_AVAILABLE）

**表现**：`NetSchedulerError` 抛出，code = "NO_PROXY_AVAILABLE"

**处理**：

- 设置 `status = "no_proxy"`
- 短暂后重试：
  - milestone类型：5秒后
  - 其他类型：2分钟后

### B站API错误（ALICLOUD_PROXY_ERR）

**表现**：阿里云函数计算代理返回错误

**处理**：

- 设置 `status = "failed"`
- 正常重试间隔后重新调度

### B站返回非0状态码

**表现**：API返回错误码（如-404视频不存在）

**处理**：

- `takeVideoSnapshot` 返回数字错误码
- 设置 `setBiliVideoStatus(aid, statusCode)`
- 标记 `status = "bili_error"`
- 后续调度检查视频状态，非0则跳过

### 超时

**表现**：调度超过2分钟未完成

**处理**：

- `scheduleCleanup` 每2分钟清理
- 删除 `started_at < NOW() - INTERVAL '2 minutes'` 的 pending/processing 调度

## 状态定义

| 状态           | 含义        | 后续动作                    |
| -------------- | ----------- | --------------------------- |
| **pending**    | 等待执行    | 被扫描后转为 processing     |
| **processing** | 正在执行    | 完成后转为 completed/failed |
| **completed**  | 执行成功    | 无                          |
| **failed**     | 执行失败    | 可被重新调度                |
| **no_proxy**   | 代理不可用  | 短暂后重试                  |
| **bili_error** | B站返回错误 | 暂停追踪                    |

## 数据写入

- **video_snapshot**: 每次执行写入1条（单视频）或多条（批量）
- **snapshot_schedule**: 更新状态
- **eta**: milestone/normal类型更新ETA计算
- **bilibili_metadata**: bili_error时更新status字段

## 并发控制

- **单视频去重**：`videoHasProcessingSchedule(aid)` 检查
- **分布式锁**：`cvsa:lock:directSnapshot-${aid}` 用于即时快照
- **Worker并发**：snapshotWorker 并发度为50
