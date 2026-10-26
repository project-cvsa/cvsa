---
title: 歌曲收集流程
description: 将ML分类为歌曲的视频收集到songs表并触发追踪
---

歌曲收集流程负责将ML分类为歌曲的视频正式纳入歌曲库，并开始持续的数据追踪。

## 自动收集（分类后）

**触发时机**：视频被分类为歌曲后（`classifyVideo`）

**执行条件**：

- ML分类结果 `label ≠ 0`（判定为歌曲）
- 视频不在 `songs` 表中

**执行流程**：

1. `classifyVideoWorker` 完成分类
2. 检查 `aidExistsInSongs(aid)`
3. 不存在 → 同时执行：
   - **创建初始追踪调度**：
     ```typescript
     scheduleSnapshot(aid, "new", Date.now() + 1.5 * MINUTE);
     scheduleSnapshot(aid, "new", Date.now() + 3 * MINUTE);
     scheduleSnapshot(aid, "new", Date.now() + 5 * MINUTE);
     scheduleSnapshot(aid, "new", Date.now() + 10 * MINUTE);
     ```
   - **插入歌曲库**：
     ```typescript
     insertIntoSongs(aid);
     ```

## 批量收集（定期扫描）

**触发时机**：每3分钟

**执行流程**：

1. `collectSongs` 定时任务触发
2. 查询 `getNotCollectedSongs()`：
   - 条件：`labelling_result.label ≠ 0` 且不在 `songs` 表中
3. 对每个 aid：
   - 检查 `aidExistsInSongs(aid)`（避免重复）
   - `insertIntoSongs(aid)`
   - `scheduleSnapshot(aid, "new", Date.now() + 10 * MINUTE)`

## 手动插入（insertSongs模式）

**触发时机**：外部系统通过 `getVideoInfo` 插入歌曲

**执行流程**：

1. `getVideoInfoWorker` 接收任务 `{ aid, insertSongs: true, uid }`
2. 若视频已存在：
   - `insertIntoSongs(aid)`
   - 发送 `addSong` 事件：
     ```typescript
     latestVideosEventsProducer.publishEvent({
       eventName: "addSong",
       songID,
       uid,
     });
     ```

## insertIntoSongs 逻辑

**检查已删除歌曲**：

```sql
SELECT id FROM songs
WHERE aid = ${aid} AND deleted = true
LIMIT 1
```

- 存在 → 恢复：`UPDATE songs SET deleted = false WHERE id = ${id}`
- 不存在 → 插入新记录

**插入新记录**：

```sql
INSERT INTO songs (aid, published_at, duration, image, producer)
VALUES (
  ${aid},
  (SELECT published_at FROM bilibili_metadata WHERE aid = ${aid}),
  (SELECT duration FROM bilibili_metadata WHERE aid = ${aid}),
  (SELECT cover_url FROM bilibili_metadata WHERE aid = ${aid}),
  (SELECT username FROM bilibili_user bu
   JOIN bilibili_metadata bm ON bm.uid = bu.uid
   WHERE bm.aid = ${aid})
)
ON CONFLICT DO NOTHING
RETURNING *
```

## 数据写入

- **songs**: 1条（新歌曲或恢复的已删除歌曲）
- **snapshot_schedule**: 4条（new类型初始追踪，自动收集时）或1条（批量收集时）

## 关键查询

**获取未收集的歌曲**：

```sql
SELECT lr.aid
FROM labelling_result lr
WHERE lr.label != 0
AND NOT EXISTS (
    SELECT 1 FROM songs s WHERE s.aid = lr.aid
)
```

**检查歌曲是否存在**：

```sql
SELECT EXISTS (
    SELECT 1 FROM songs WHERE aid = ${aid}
)
```
