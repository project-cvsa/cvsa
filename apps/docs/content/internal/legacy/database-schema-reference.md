---
title: 核心数据表
description: 爬虫系统关键数据表的结构与用途
---

## snapshot_schedule

核心调度表，记录所有待执行和已执行的快照任务。

| 字段                | 类型                  | 说明                                                          |
| ------------------- | --------------------- | ------------------------------------------------------------- |
| id                  | bigserial             | 主键                                                          |
| aid                 | bigint                | 视频AID                                                       |
| type                | text                  | 类型：new/milestone/normal/archive                            |
| status              | text                  | 状态：pending/processing/completed/failed/no_proxy/bili_error |
| created_at          | timestamp             | 创建时间                                                      |
| started_at          | timestamp             | 计划执行时间                                                  |
| finished_at         | timestamp             | 完成时间                                                      |
| started_at_5min_utc | timestamp (generated) | 5分钟窗口时间（用于限流）                                     |

**索引**：`(aid, status, type)`, `(status, started_at_5min_utc)`

## video_snapshot

存储每次采集的视频播放数据。

| 字段       | 类型      | 说明             |
| ---------- | --------- | ---------------- |
| id         | serial    | 主键             |
| aid        | bigint    | 视频AID（索引）  |
| created_at | timestamp | 采集时间（索引） |
| views      | integer   | 播放量           |
| coins      | integer   | 硬币数           |
| likes      | integer   | 点赞数           |
| favorites  | integer   | 收藏数           |
| shares     | integer   | 分享数           |
| danmakus   | integer   | 弹幕数           |
| replies    | integer   | 评论数           |

## latest_video_snapshot

由数据库触发器驱动，提供各视频的最新快照数据快速查询。

| 字段                                          | 类型      | 说明             |
| --------------------------------------------- | --------- | ---------------- |
| aid                                           | bigint    | 主键             |
| time                                          | timestamp | 快照时间（索引） |
| views                                         | integer   | 播放量（索引）   |
| coins/likes/favorites/replies/danmakus/shares | integer   | 各指标           |

## bilibili_metadata

缓存B站视频的基本信息。

| 字段         | 类型      | 说明                |
| ------------ | --------- | ------------------- |
| id           | serial    | 主键                |
| aid          | bigint    | 视频AID（唯一索引） |
| bvid         | varchar   | BV号（索引）        |
| title        | text      | 标题                |
| description  | text      | 描述                |
| tags         | text      | 标签（逗号分隔）    |
| uid          | bigint    | UP主UID（索引）     |
| published_at | timestamp | 发布时间            |
| duration     | integer   | 时长（秒）          |
| cover_url    | text      | 封面URL             |
| status       | integer   | B站状态码（默认0）  |
| created_at   | timestamp | 入库时间            |

## bilibili_user

缓存UP主的信息

| 字段                  | 类型      | 说明            |
| --------------------- | --------- | --------------- |
| id                    | serial    | 主键            |
| uid                   | bigint    | UID（唯一索引） |
| username              | text      | 用户名          |
| desc                  | text      | 签名            |
| fans                  | integer   | 粉丝数          |
| avatar                | text      | 头像URL         |
| created_at/updated_at | timestamp | 时间戳          |

## songs

歌曲的基本信息

| 字段                  | 类型      | 说明                  |
| --------------------- | --------- | --------------------- |
| id                    | serial    | 主键                  |
| aid                   | bigint    | 视频AID（唯一索引）   |
| name                  | text      | 歌曲名                |
| published_at          | timestamp | 发布时间              |
| duration              | integer   | 时长                  |
| image                 | text      | 封面                  |
| producer              | text      | 制作人/UP主名         |
| netease_id            | bigint    | 网易云ID（唯一索引）  |
| deleted               | boolean   | 是否删除（默认false） |
| created_at/updated_at | timestamp | 时间戳                |

## labelling_result

存储ML模型分类视频的结果

| 字段          | 类型       | 说明                 |
| ------------- | ---------- | -------------------- |
| id            | serial     | 主键                 |
| aid           | bigint     | 视频AID（索引）      |
| label         | smallint   | 分类标签（0=非歌曲） |
| model_version | text       | 模型版本（如"3.17"） |
| logits        | smallint[] | 分类logits           |
| created_at    | timestamp  | 分类时间             |

**索引**：`(aid, model_version)`（唯一）, `(label, model_version)`

## eta

存储预估某个视频达成下一个成就的时间

| 字段          | 类型      | 说明                       |
| ------------- | --------- | -------------------------- |
| aid           | bigint    | 主键                       |
| eta           | real      | 预计到达成就的时间（小时） |
| speed         | real      | 当前增速（播放量/小时）    |
| current_views | integer   | 当前播放量                 |
| updated_at    | timestamp | 更新时间                   |

## Redis Key模式

| Key                           | 用途             |
| ----------------------------- | ---------------- |
| `cvsa:lock:${id}`             | 分布式锁         |
| `cvsa:snapshot_window_counts` | 快照限流窗口计数 |
| `cvsa:${name}_${index}`       | 多窗口限流器     |
| `bullmq:*`                    | BullMQ内部存储   |
