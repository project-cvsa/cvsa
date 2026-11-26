---
title: 消息队列与任务定义（旧版）
description: 早期 BullMQ 队列配置、定时任务与 Job 数据结构（已废弃）。
docType: reference
status: deprecated
---

> **已废弃文档说明**：本文档记录早期四队列结构，当前爬虫通过 `apps/crawler` 内的新队列与状态驱动调度运行。请查阅 [历史归档索引](./index.md) 与 [爬虫发现、策展与追踪规约](/zh/engineering/specs/crawler-and-curation)。

爬虫系统使用BullMQ作为消息队列，Redis作为底层存储。

## 队列定义

```typescript
// packages/crawler/mq/index.ts
LatestVideosQueue   → "latestVideos"
ClassifyVideoQueue  → "classifyVideo"
SnapshotQueue       → "snapshot"
MiscQueue           → "misc"
```

## Worker路由

### latestVideoWorker (并发度: 6)

```typescript
switch (job.name) {
  case "getLatestVideos":  → getLatestVideosWorker
  case "getVideoInfo":     → getVideoInfoWorker
  case "collectSongs":     → collectSongsWorker
}
```

### snapshotWorker (并发度: 50)

```typescript
switch (job.name) {
  case "directSnapshot":            → directSnapshotWorker
  case "snapshotVideo":             → snapshotVideoWorker
  case "snapshotTick":              → snapshotTickWorker
  case "bulkSnapshotTick":          → bulkSnapshotTickWorker
  case "dispatchMilestoneSnapshots":→ dispatchMilestoneSnapshotsWorker
  case "dispatchRegularSnapshots":  → dispatchRegularSnapshotsWorker
  case "scheduleCleanup":           → scheduleCleanupWorker
  case "bulkSnapshotVideo":         → takeBulkSnapshotForVideosWorker
}
```

### filterWorker (并发度: 2)

```typescript
switch (job.name) {
  case "classifyVideo":  → classifyVideoWorker
  case "classifyVideos": → classifyVideosWorker
}
```

### miscWorker (并发度: 5)

```typescript
switch (job.name) {
  case "collectQueueMetrics": → collectQueueMetrics
}
```

## 定时任务配置

```typescript
// packages/crawler/mq/init.ts
LatestVideosQueue.upsertJobScheduler("getLatestVideos", {
  every: 1 * MINUTE,
  immediately: true,
});

ClassifyVideoQueue.upsertJobScheduler("classifyVideos", {
  every: 5 * MINUTE,
  immediately: true,
});

LatestVideosQueue.upsertJobScheduler("collectSongs", {
  every: 3 * MINUTE,
  immediately: true,
});

SnapshotQueue.upsertJobScheduler(
  "snapshotTick",
  {
    every: 1 * SECOND,
    immediately: true,
  },
  { opts: { removeOnComplete: 300, removeOnFail: 600 } },
);

SnapshotQueue.upsertJobScheduler(
  "bulkSnapshotTick",
  {
    every: 15 * SECOND,
    immediately: true,
  },
  { opts: { removeOnComplete: 60, removeOnFail: 600 } },
);

SnapshotQueue.upsertJobScheduler("dispatchMilestoneSnapshots", {
  every: 5 * MINUTE,
  immediately: true,
});

SnapshotQueue.upsertJobScheduler("dispatchRegularSnapshots", {
  every: 30 * MINUTE,
  immediately: true,
});

SnapshotQueue.upsertJobScheduler("dispatchArchiveSnapshots", {
  every: 2 * HOUR,
  immediately: false,
});

SnapshotQueue.upsertJobScheduler("scheduleCleanup", {
  every: 2 * MINUTE,
  immediately: true,
});

MiscQueue.upsertJobScheduler("collectQueueMetrics", {
  every: 3 * SECOND,
  immediately: true,
});
```

## Job数据结构

### GetVideoInfoJobData

```typescript
interface GetVideoInfoJobData {
  aid: number; // 视频AID
  insertSongs?: boolean; // 是否直接插入songs表
  uid?: string; // 用户ID（insertSongs模式）
}
```

### 快照VideoJobData

```typescript
// snapshotVideo
{
  id: number; // 调度ID
  aid: number; // 视频AID
  type: "milestone" | "normal" | "new";
}
```

### 批量快照JobData

```typescript
// bulkSnapshotVideo
{
  schedules: Array<{
    id: number;
    aid: number;
    type: string;
    created_at: string;
    started_at: string;
    finished_at: string | null;
    status: string;
  }>;
}
```

### 分类VideoJobData

```typescript
// classifyVideo
{
  aid: number;
}
```

## 任务优先级

| 任务      | 优先级 | 说明               |
| --------- | ------ | ------------------ |
| milestone | 1      | 成就追踪最高优先级 |
| new       | 1      | 新视频初始追踪     |
| archive   | 2      | 存档快照           |
| normal    | 3      | 常规快照           |
| bulk      | 3      | 批量快照           |

## 事件发布

```typescript
// addSong事件
latestVideosEventsProducer.publishEvent<{
  eventName: "addSong";
  songID: number;
  uid: string;
}>();
```

## 分布式锁

使用 `LockManager` 防止重复执行：

```typescript
lockManager.acquireLock("dispatchRegularSnapshots", 30 * 60);
lockManager.acquireLock("dispatchArchiveSnapshots", 30 * 60);
lockManager.acquireLock("getLatestVideos");
lockManager.acquireLock("classifyVideos", 5 * 60);
lockManager.acquireLock(`directSnapshot-${aid}`, 75);
```
