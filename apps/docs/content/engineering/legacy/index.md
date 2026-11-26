---
title: 历史归档
description: 早期概要设计与旧版爬虫架构文档留档（已废弃，仅作历史背景参考）。
docType: reference
status: deprecated
---

> **已废弃文档说明**：本目录收录 CVSA 早期版本的设计提案与旧版爬虫文档，已不再反映当前仓库实现。当前实际系统设计与接口契约请查阅以下文档：
> - [系统架构](/zh/engineering/architecture)与[仓库布局](/zh/engineering/repository)
> - [爬虫发现、策展与追踪规约](/zh/engineering/specs/crawler-and-curation)
> - [开发进度与路线图](/zh/plans)
> - [架构决策记录 (ADR)](/zh/decisions)

## 归档文档索引

- [概要设计文档 (HLD)](./hld.mdx)：早期全栈技术选型与 C4 架构图留档。
- [新版爬虫分布式设想](./crawler-overview.md)：早期提出的 Master / Standby / Edge 多节点与 S3 同步方案设想。
- [旧版爬虫架构概览](./architecture-overview.md)：基于 `snapshot_schedule` 与旧版四队列的早期爬虫设计。
- [一次完整爬取的生命周期](./crawling-lifecycle.md)：旧版调度与抓取链路示例。
- [视频发现与元数据采集](./video-discovery-pipeline.md)：旧版 `newlist` 发现与 `bilibili_user` 分表设计。
- [歌曲收集流程](./song-collection-pipeline.md)：旧版自动入库流程留档。
- [快照调度系统](./snapshot-scheduling.md)：旧版 `snapshot_schedule` 调度算法说明。
- [快照执行与错误处理](./snapshot-execution.md)：旧版单视频与批量快照执行机制。
- [消息队列与任务定义](./message-queue-reference.md)：旧版 BullMQ 队列与定时任务配置。
- [核心数据表](./database-schema-reference.md)：旧版表结构与 Redis Key 说明。
- [网络代理架构](./network-proxy-architecture.md)：旧版函数计算与 Cloudflare Worker 代理层设计。
