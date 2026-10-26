---
title: 一次完整爬取的生命周期
description: 从视频发现到成就追踪的全流程示例，展示爬虫系统如何处理一个新视频的完整生命周期
---

以一个**新发现的B站视频**（aid=12345）为例，展示从发现到持续追踪的完整流程。

## 第一步：视频发现

**触发时机**：每1分钟

**执行流程**：

1. `getLatestVideos` 定时任务触发
2. 调用 `queueLatestVideos()` 开始爬取B站最新视频列表
3. 分页请求 `api.bilibili.com/x/web-interface/newlist`
4. 对每个获取到的视频AID，检查 `videoExistsInAllData(aid)`
5. 发现 aid=12345 不在数据库中，加入队列：
   ```typescript
   LatestVideosQueue.add("getVideoInfo", { aid: 12345 });
   ```

**数据写入**：无（仅入队）

## 第二步：元数据采集

**触发时机**：Worker消费队列任务

**执行流程**：

1. `getVideoInfoWorker` 接收到任务 `{ aid: 12345 }`
2. 通过 `NetworkDelegate` 代理请求B站API获取视频详情
3. 解析响应数据，同时写入三张表：
   - **bilibili_metadata**：标题、描述、标签、封面、时长、发布时间
   - **bilibili_user**：UP主的UID、用户名、粉丝数、头像
   - **video_snapshot**：首次快照（播放量、硬币、点赞、收藏、分享、弹幕、评论）
4. 触发后续分类任务：
   ```typescript
   ClassifyVideoQueue.add("classifyVideo", { aid: 12345 });
   ```

**数据写入**：

- bilibili_metadata (1条)
- bilibili_user (1条，存在则更新)
- video_snapshot (1条)

## 第三步：视频分类

**触发时机**：`filterWorker`消费队列任务

**执行流程**：

1. `classifyVideoWorker` 接收到任务
2. 提取视频的标题、描述、标签
3. 调用ML服务 `Akari.classifyVideo(title, description, tags, 12345)`
4. 假设返回 `label = 1`（判定为歌曲）
5. 写入分类结果：`INSERT INTO labelling_result (aid=12345, label=1, model_version="3.17")`
6. 立即为新增歌曲创建密集的初始追踪计划：
   ```typescript
   scheduleSnapshot(12345, "new", Date.now() + 1.5 * MINUTE);
   scheduleSnapshot(12345, "new", Date.now() + 3 * MINUTE);
   scheduleSnapshot(12345, "new", Date.now() + 5 * MINUTE);
   scheduleSnapshot(12345, "new", Date.now() + 10 * MINUTE);
   ```
7. 将视频加入歌曲库：`INSERT INTO songs (aid=12345, ...)`

**数据写入**：

- labelling_result (1条)
- songs (1条)
- snapshot_schedule (4条，type="new"，status="pending")

## 第四步：初始追踪（new类型）

**触发时机**：每1秒扫描（`snapshotTick`）

**执行流程**：

`snapshotTick` 每秒执行一次，查询 `started_at` 在未来1秒内到期的 pending 调度（`LIMIT 10`）。由于4条 "new" 调度分别设置在1.5分钟、3分钟、5分钟、10分钟后，它们会在各自到期时被依次发现。

每次发现一条到期调度时的处理流程：

1. `snapshotTickWorker` 查询 `getSnapshotsInNextSecond()`，发现即将到期的一条 "new" 调度
2. 检查 `videoHasProcessingSchedule(12345)` 确保该视频无正在处理的快照
3. 设置状态为 processing，并将任务加入队列（优先级=1）：
   ```typescript
   SnapshotQueue.add(
     "snapshotVideo",
     { id, aid: 12345, type: "new" },
     { priority: 1 },
   );
   ```
4. `snapshotVideoWorker` 处理：
   - 检查调度是否存在、视频状态是否正常
   - 通过代理请求B站API获取最新数据
   - 写入 `video_snapshot`（一条快照记录）
   - 计算 `views/hour` 初始速度
   - 若速度>10/小时且发布时间<48小时，继续调度下一次 "new" 快照
   - 否则停止 "new" 追踪，转由常规调度接管

**数据写入**：

- video_snapshot (4条，逐条写入)
- snapshot_schedule (4条，status从pending→completed)
- 可能新增若干条 "new" 类型调度（视速度而定）

## 第五步：常规追踪与成就预判

**触发时机**：每30分钟（`dispatchRegularSnapshots`）+ 每5分钟（`dispatchMilestoneSnapshots`）

### 常规追踪

1. `dispatchRegularSnapshots` 发现视频缺少活跃的 "normal" 类型调度
2. 计算 `getRegularSnapshotInterval()`：
   - 获取过去24小时内的快照数据
   - 计算平均播放量增速
   - 根据速度决定间隔：
     - 速度 = 0 → 72小时
     - 速度 < 6/天 → 36小时
     - 速度 6~119/天 → 24小时
     - 速度 120~319/天 → 12小时
     - 速度 ≥ 320/天 → 6小时
3. 创建常规调度：`scheduleSnapshot(12345, "normal", now + interval * HOUR)`
4. 后续每15秒由 `bulkSnapshotTick` 批量扫描并执行

### 成就预判

当视频播放量接近成就点（10万、100万、200万……1000万、1100万……等）：

1. `dispatchMilestoneSnapshots` 查询 `getVideosNearMilestone()`
2. 发现 aid=12345 的 views=85000，接近10万成就点
3. 调用 `getAdjustedShortTermETA()` 计算ETA：
   - 查找最近快照和历史快照
   - 计算 `速度 = (views差) / (时间差)`
   - `ETA = (100000 - 85000) / 速度 / 加速因子`
4. 若ETA < 144小时（6天），创建成就追踪：
   ```typescript
   scheduleSnapshot(12345, "milestone", now + ETA * HOUR);
   ```
5. `snapshotVideo` 处理 "milestone" 类型：
   - 成功后检查是否达成成就
   - 若未达成，重新计算ETA并调度下一次
   - 若已达成，不再调度，等待常规追踪接管

**数据写入**：

- snapshot_schedule (常规 + 成就追踪，type="normal"/"milestone")
- video_snapshot (常规快照，由bulkSnapshot批量写入)
- eta (ETA计算结果)

## 第六步：存档追踪

**触发时机**：每2小时（`dispatchArchiveSnapshots`）

**执行流程**：

`dispatchArchiveSnapshots` 为两组视频创建存档快照：

**第一组：songs表中的视频**

- 查询条件：在songs表中，但没有pending/processing状态的archive调度
- 调度时间：下周六（`nextSaturday(date)`）

**第二组：非歌曲视频**

- 查询条件：在bilibili_metadata中，但不在songs表中（`getCommonArchiveAids`）
- 调度时间：下周一到再下周一之间随机（约7天范围内）

**存档快照的执行**：

1. `bulkSnapshotTick` 每15秒扫描，查询包含 `type = 'normal' OR type = 'archive'` 的调度
2. 对archive类型的视频：
   - 正常执行快照，写入 `video_snapshot`
   - 标记 `snapshot_schedule` 状态为 completed

**数据写入**：

- snapshot_schedule (type="archive")
- video_snapshot (存档快照)

## 异常路径示例

### 场景A：代理不可用

1. `snapshotVideo` 执行时抛出 `NetSchedulerError("NO_PROXY_AVAILABLE")`
2. 设置 `status = "no_proxy"`
3. 短暂重试（2分钟后重新调度）
4. 若B站API正常，后续请求会成功

### 场景B：视频被删除/下架

1. B站API返回非0状态码（如-404）
2. `takeVideoSnapshot` 返回数字错误码
3. 设置 `setBiliVideoStatus(12345, -404)`
4. 后续调度检查 `getBiliVideoStatus(12345)`，若不为0则跳过

### 场景C：超时调度清理

1. `scheduleCleanup` 每2分钟运行
2. 查询 `started_at < NOW() - INTERVAL '2 minutes'` 的 pending/processing 调度
3. 删除超时记录，防止僵尸调度堆积

## 状态流转

```
pending ──► processing ──► completed
    │           │
    │           ├──► failed (可重试)
    │           ├──► no_proxy (短暂后重试)
    │           └──► bili_error (B站返回错误，暂停追踪)
    │
    └──► 被 scheduleCleanup 删除 (超时2分钟)
```
