---
title: 快照调度系统
description: 快照调度的三种类型、时间计算策略与流量控制机制
---

快照调度系统负责决定何时对哪些视频执行数据采集，核心数据存储于 `snapshot_schedule` 表。

## 调度类型概览

| 类型          | 用途                     | 调度来源                     | 扫描频率                   |
| ------------- | ------------------------ | ---------------------------- | -------------------------- |
| **new**       | 新发现歌曲的初始密集追踪 | `classifyVideo`              | 每秒（snapshotTick）       |
| **milestone** | 成就点临近时的精准追踪   | `dispatchMilestoneSnapshots` | 每秒（snapshotTick）       |
| **normal**    | 常规间隔追踪             | `dispatchRegularSnapshots`   | 每15秒（bulkSnapshotTick） |
| **archive**   | 存档快照                 | `dispatchArchiveSnapshots`   | 每15秒（bulkSnapshotTick） |

## new类型：初始追踪

**创建时机**：视频被ML分类为歌曲后（`label ≠ 0`）

**初始调度**：

```typescript
scheduleSnapshot(aid, "new", Date.now() + 1.5 * MINUTE);
scheduleSnapshot(aid, "new", Date.now() + 3 * MINUTE);
scheduleSnapshot(aid, "new", Date.now() + 5 * MINUTE);
scheduleSnapshot(aid, "new", Date.now() + 10 * MINUTE);
```

**执行逻辑**：

1. `snapshotTick` 每秒扫描 `started_at` 在未来1秒内到期的调度（`LIMIT 10`）
2. 检查 `videoHasProcessingSchedule(aid)` 避免同一视频并发执行
3. 设置优先级为1（最高），加入队列
4. 执行完成后，根据速度决定是否继续追踪：
   - 发布时间 < 48小时 且 速度 > 10/小时 → 继续调度下一次 "new"
   - 否则停止，等待常规调度接管

## milestone类型：成就预判

**触发时机**：每5分钟

**识别成就临近视频**：

查询 `getVideosNearMilestone()`，识别播放量接近以下成就点的视频：

- 10万、100万、200万……（每100万一个阶梯）
- 或 ETA < 2300小时的视频

**ETA计算**：

```typescript
getAdjustedShortTermETA(aid)
├── 获取最新快照
├── 获取历史快照（3分钟/20分钟/1小时/3小时/6小时/72小时前）
├── 计算各时间窗口的速度
├── 取最大速度计算到达下一个成就的ETA
└── 应用加速因子：factor = log(4.5 / log(viewsToIncrease + 100), 1.054) + 0.601
```

**调度策略**：

- ETA < 144小时（6天）→ 调度快照
- 调度时间 = now + ETA（限制在2秒~1.2小时之间）
- 若视频已有同类型待处理调度，更新其时间为更早的

**执行后处理**：

- 若已达成成就 → 不再调度，转由常规追踪
- 若未达成 → 重新计算ETA并调度下一次

## normal类型：常规追踪

**触发时机**：每30分钟

**识别目标视频**：

查询 `getVideosWithoutActiveSnapshotScheduleByType("normal")`，即：

- 在songs表中
- 没有pending/processing状态的normal类型调度

**间隔计算**：

根据过去24小时的播放量增速决定：

| 播放量增速 | 快照间隔 |
| ---------- | -------- |
| = 0        | 72小时   |
| < 6/天     | 36小时   |
| 6~119/天   | 24小时   |
| 120~319/天 | 12小时   |
| ≥ 320/天   | 6小时    |

**流量控制**：

使用 `adjustSnapshotTime()` 进行限流，确保每个5分钟时间窗口内不超过1000个快照：

- Redis Key: `cvsa:snapshot_window_counts`
- 若目标窗口已满，顺延到下一个窗口
- 添加随机偏移（0~5分钟）分散压力

## scheduleSnapshot 函数详解

`scheduleSnapshot` 是创建调度的核心函数，内部逻辑按以下顺序执行：

### 1. milestone 类型的特殊处理

当 `type === "milestone"` 且该视频已有同类型的活跃调度时：

```
获取该视频最新的 milestone 活跃调度
    ↓
比较：新调度时间 vs 已有调度时间
    ↓
若新时间更早 → 更新时间（提前成就追踪）
若新时间更晚或相同 → 直接返回（保留现有调度）
```

**更新时间的事务逻辑**：

```typescript
// 1. 开启事务，锁定该行
SELECT * FROM snapshot_schedule WHERE id = ${id} FOR UPDATE

// 2. 如果原调度还是 pending 状态
//    减少原时间窗口的 Redis 计数
oldWindow = getWindowFromDate(oldSchedule.startedAt)
decrWindowCount(redis, oldWindow)

// 3. 更新调度时间
UPDATE snapshot_schedule SET started_at = ${newTime} WHERE id = ${id}

// 4. 增加新时间窗口的 Redis 计数
newWindow = getWindowFromDate(newTime)
incrWindowCount(redis, newWindow)
```

### 2. 防重复检查

非强制模式下（`force = false`），如果视频已有同类型的活跃调度，直接返回：

```typescript
if (hasActiveSchedule && !force) return;
```

### 3. 时间调整策略

根据类型决定是否需要流量控制：

| 类型      | 是否需要 adjustSnapshotTime | 说明                        |
| --------- | --------------------------- | --------------------------- |
| milestone | 否                          | 直接 Redis +1，保留精确时间 |
| new       | 否                          | 直接 Redis +1，保留精确时间 |
| normal    | 是                          | 需要限流调整                |
| archive   | 是                          | 需要限流调整                |

**adjustSnapshotTime 算法**：

```
目标窗口 = floor(目标时间 / 5分钟) * 5分钟

// 向前查找最多10天（4032个窗口）
for i = 0 to 4032:
    尝试窗口 = 目标窗口 + i * 5分钟
    当前计数 = Redis HINCRBY (cvsa:snapshot_window_counts, 尝试窗口, 1)

    if 当前计数 <= 1000:
        // 找到可用窗口
        随机延迟 = random() * 5分钟
        最终时间 = 尝试窗口 + 随机延迟

        if 最终时间 < now:
            return now  // 不能调度到过去
        return 最终时间
    else:
        // 窗口已满，撤销计数
        Redis HINCRBY (cvsa:snapshot_window_counts, 尝试窗口, -1)

// 向前找不到，尝试向后回退最多6个窗口
for i = 0 to 5:
    尝试窗口 = 目标窗口 - i * 5分钟
    ...（同上逻辑）

return 原始目标时间  // 兜底
```

### 4. 最终写入

```sql
INSERT INTO snapshot_schedule (aid, type, started_at)
VALUES (${aid}, ${type}, ${adjustedTime})
```

## archive类型：存档追踪

**触发时机**：每2小时

**目标视频**：

- **第一组**：songs表中无active archive调度的视频 → 下周六
- **第二组**：bilibili_metadata中但不在songs表中的视频 → 下周一到再下周一随机

## 调度状态流转

```
pending ──► processing ──► completed
    │           │
    │           ├──► failed
    │           ├──► no_proxy
    │           └──► bili_error
    │
    └──► 被 scheduleCleanup 删除（超时2分钟）
```

## 超时清理

**触发时机**：每2分钟

**清理规则**：

删除 `started_at < NOW() - INTERVAL '2 minutes'` 且状态为 pending/processing 的调度。

## 调度扫描对比

| Worker           | 扫描间隔 | 查询类型                     | 处理上限  | 优先级              |
| ---------------- | -------- | ---------------------------- | --------- | ------------------- |
| snapshotTick     | 1秒      | type ≠ 'normal'              | 10条/次   | milestone=1, new=3  |
| bulkSnapshotTick | 15秒     | type = 'normal' OR 'archive' | 1000条/次 | normal=3, archive=2 |

## 数据写入

- **snapshot_schedule**：创建调度记录（status=pending）
- **video_snapshot**：执行快照后写入采集数据
- **eta**：milestone类型执行后更新ETA计算
