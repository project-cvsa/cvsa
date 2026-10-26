---
title: 系统架构概览
description: 爬虫系统的整体架构、核心组件与数据流向
---

CVSA 的爬虫系统是一个基于 BullMQ 消息队列的数据采集系统，用于持续追踪 Bilibili 视频的播放数据。

## 核心进程

系统由 4 个独立进程组成：

| 进程           | 入口文件          | 职责                   | 队列消费                     |
| -------------- | ----------------- | ---------------------- | ---------------------------- |
| **任务调度器** | `jobAdder.ts`     | 创建定时任务           | 无（仅初始化）               |
| **主工作进程** | `worker.ts`       | 处理视频发现、快照执行 | latestVideos, snapshot, misc |
| **ML分类进程** | `filterWorker.ts` | 视频内容分类           | classifyVideo                |
| **监控面板**   | `bullui.ts`       | Web UI 监控            | 无（Express服务）            |

## 消息队列

4 个 BullMQ 队列：

| 队列              | 用途                 | 并发度 |
| ----------------- | -------------------- | ------ |
| **latestVideos**  | 视频发现与元数据采集 | 6      |
| **classifyVideo** | ML内容分类           | 2      |
| **snapshot**      | 快照执行（核心）     | 50     |
| **misc**          | 指标收集             | 5      |

## 数据流向

```
视频发现
    ↓
getLatestVideos ──► getVideoInfo ──► classifyVideo
    ↓                                    ↓
bilibili_metadata                  labelling_result
bilibili_user                           ↓
video_snapshot                      songs（若是歌曲）
                                         ↓
                                    scheduleSnapshot
                                         ↓
                              snapshot_schedule（调度表）
                                         ↓
                              snapshotVideo / bulkSnapshot
                                         ↓
                              video_snapshot（持续追踪）
```

## 核心数据表

| 表名                      | 用途         | 关键字段                      |
| ------------------------- | ------------ | ----------------------------- |
| **snapshot_schedule**     | 调度中心     | aid, type, status, started_at |
| **video_snapshot**        | 历史快照     | aid, views, likes, coins...   |
| **latest_video_snapshot** | 最新状态视图 | aid, time, views...           |
| **bilibili_metadata**     | 视频元数据   | aid, title, description, tags |
| **bilibili_user**         | UP主信息     | uid, username, fans           |
| **songs**                 | 歌曲库       | aid, published_at             |
| **labelling_result**      | ML分类结果   | aid, label, model_version     |
| **eta**                   | ETA计算缓存  | aid, eta, speed               |

## 外部依赖

- **Bilibili API**: 视频数据获取
- **Redis**: 消息队列存储、分布式锁、限流计数
- **PostgreSQL**: 业务数据存储
- **ML Service**: localhost:8544 视频分类
- **OpenTelemetry**: localhost:4317 指标上报

## 调度周期

| 任务                       | 周期   | 队列          |
| -------------------------- | ------ | ------------- |
| getLatestVideos            | 1分钟  | latestVideos  |
| classifyVideos             | 5分钟  | classifyVideo |
| collectSongs               | 3分钟  | latestVideos  |
| snapshotTick               | 1秒    | snapshot      |
| bulkSnapshotTick           | 15秒   | snapshot      |
| dispatchMilestoneSnapshots | 5分钟  | snapshot      |
| dispatchRegularSnapshots   | 30分钟 | snapshot      |
| dispatchArchiveSnapshots   | 2小时  | snapshot      |
| scheduleCleanup            | 2分钟  | snapshot      |
| collectQueueMetrics        | 3秒    | misc          |

## 限流机制

1. **分布式锁**: `cvsa:lock:${id}` 防止重复执行
2. **窗口限流**: `cvsa:snapshot_window_counts` 每5分钟窗口最多1000个快照
3. **API限速**: B站API限流（20/s, 130/15s, 2000/5min）
4. **并发控制**: Worker 级别并发限制

## 典型生命周期

视频从发现到持续追踪：

1. **发现**: getLatestVideos 爬取B站新视频
2. **入库**: getVideoInfo 写入元数据和首次快照
3. **分类**: classifyVideo ML判断是否为歌曲
4. **初始追踪**: new类型快照密集追踪（1.5/3/5/10分钟后）
5. **常规追踪**: normal类型按速度自适应间隔
6. **成就预判**: milestone类型在接近成就点时精准追踪
7. **存档**: archive类型定期记录最终状态
