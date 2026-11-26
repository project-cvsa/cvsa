---
title: 想法与备忘
description: 存放尚未形成正式排期或架构决定的早期探索性笔记与设计草稿。
docType: explanation
---

*Updated 2026-11-27.* 本目录用于记录尚未成熟、仍在验证或讨论中的早期技术构想与启发式草案，将其与已承诺的 [进度与路线图](/zh/plans) 及不可变的 [架构决策](/zh/decisions) 严格隔离，防止半成品假设干扰现有实现规范。

一篇备忘无需完整模板，只需说明问题缘起、候选思路与待验证的疑问。当某个想法转化为实际开发计划或定型架构方案后，正式文档将迁入 `plans/` 或 `decisions/`，此处保留原稿并附上迁出链接，便于后人回溯早期推理脉络。

## 现有备忘

- **[多阶段发现漏斗的启发式规则与阈值构想](./multi-stage-discovery-heuristics.md)**（草稿）：探索如何在调用 Bilibili 视频详情接口和 `akari` ONNX 推理前，利用分区权重、结构化词库分词与置信度区间分流降低噪声抓取成本。
- **[开放注册后的贡献复核队列与声誉联动构想](./public-contribution-review-queue.md)**（草稿）：探讨在放开邀请制注册限制后，如何利用已建表的 `meta.history` 与 `platform.reputation_history` 实现“提案复核”与“直接写入”的分级编目体验。
