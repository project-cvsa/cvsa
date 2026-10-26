---
title: 视频发现与元数据采集
description: 从B站发现新视频、采集元数据并触发分类的流程
---

视频发现流程负责从Bilibili获取最新视频，采集元数据，并触发后续的分类和追踪。

## 视频发现

**触发时机**：每1分钟

**执行流程**：

1. `getLatestVideos` 定时任务触发
2. 调用 `queueLatestVideos()` 开始爬取
3. 分页请求 `api.bilibili.com/x/web-interface/newlist`
   - 第1页: 10条
   - 后续页: 30条/页
4. 对每个视频AID，检查 `videoExistsInAllData(aid)`
5. 已存在的视频 → 跳过
6. 新视频 → 加入队列：
   ```typescript
   LatestVideosQueue.add(
     "getVideoInfo",
     { aid },
     {
       attempts: 100,
       backoff: { delay: 5 * SECOND, type: "fixed" },
     },
   );
   ```

**终止条件**：

- 某页全部视频已存在 → 停止翻页
- 或遍历完所有页面

## 元数据采集

**触发时机**：Worker消费 `getVideoInfo` 任务

**执行流程**：

1. `getVideoInfoWorker` 接收任务 `{ aid, insertSongs?, uid? }`
2. 若视频已存在且无需插入歌曲 → 直接返回
3. 若视频已存在但需要插入歌曲：
   - 调用 `insertIntoSongs(aid)`
   - 发送 `addSong` 事件
   - 返回
4. 新视频 → 通过 `NetworkDelegate` 请求B站API：
   ```typescript
   getVideoDetails(aid); // api.bilibili.com/x/web-interface/view
   ```

**数据解析与写入**：

| 数据     | 来源字段           | 写入表                        |
| -------- | ------------------ | ----------------------------- |
| 标题     | View.title         | bilibili_metadata.title       |
| 描述     | View.desc          | bilibili_metadata.description |
| 标签     | Tags[].tag_name    | bilibili_metadata.tags        |
| 封面     | View.pic           | bilibili_metadata.coverUrl    |
| 时长     | View.duration      | bilibili_metadata.duration    |
| 发布时间 | View.pubdate       | bilibili_metadata.publishedAt |
| UP主UID  | View.owner.mid     | bilibili_metadata.uid         |
| UP主名   | View.owner.name    | bilibili_user.username        |
| UP主头像 | View.owner.face    | bilibili_user.avatar          |
| UP主粉丝 | Card.follower      | bilibili_user.fans            |
| 播放量   | View.stat.view     | video_snapshot.views          |
| 硬币     | View.stat.coin     | video_snapshot.coins          |
| 点赞     | View.stat.like     | video_snapshot.likes          |
| 收藏     | View.stat.favorite | video_snapshot.favorites      |
| 分享     | View.stat.share    | video_snapshot.shares         |
| 弹幕     | View.stat.danmaku  | video_snapshot.danmakus       |
| 评论     | View.stat.reply    | video_snapshot.replies        |

**后续触发**：

- 非歌曲插入模式 → 触发分类：
  ```typescript
  ClassifyVideoQueue.add("classifyVideo", { aid });
  ```
- 歌曲插入模式 → 直接入库：
  ```typescript
  insertIntoSongs(aid);
  publishAddsongEvent(songID, uid);
  ```

## 数据写入

- **bilibili_metadata**: 1条（视频元数据）
- **bilibili_user**: 1条（UP主信息，存在则更新）
- **video_snapshot**: 1条（首次快照数据）

## 异常处理

**网络错误**：

- `NetSchedulerError` → 重试队列：
  ```typescript
  LatestVideosQueue.add(
    "getVideoInfo",
    { aid },
    {
      attempts: 10,
      backoff: { delay: 30 * SECOND, type: "fixed", jitter: 1 },
    },
  );
  ```

## 关键查询

**检查视频是否存在**：

```sql
SELECT id FROM bilibili_metadata WHERE aid = ${aid} LIMIT 1
```

**UPSERT UP主信息**：

```sql
INSERT INTO bilibili_user (uid, username, avatar, fans, desc)
VALUES (..., ..., ..., ..., ...)
ON CONFLICT (uid) DO UPDATE SET
  username = EXCLUDED.username,
  avatar = EXCLUDED.avatar,
  fans = EXCLUDED.fans,
  desc = EXCLUDED.desc
```
