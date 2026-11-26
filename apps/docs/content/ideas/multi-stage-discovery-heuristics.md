---
title: 多阶段发现漏斗的启发式规则与阈值构想
description: 关于在现有白名单与 ONNX 分类器之前引入 Bilibili 分区过滤、词库分词与三分流阈值的早期探索笔记。
docType: explanation
status: draft
---

*Recorded 2026-11-27.* 本文记录针对 CVSA 候选视频发现流程的早期优化构想。核心思路已纳入 [爬虫发现、标注策展与调度路线图](/zh/plans/crawler-and-discovery-roadmap) 的后续方向，具体的数值边界与词库维护方案仍待实验数据确认。

## 问题缘起

当前 `DiscoveryCandidateEvaluator` 对搜索漫游（`SearchRover`）或关联推荐返回的几乎所有未见过 `aid` 都会先请求 Bilibili 详情接口，再经由 `DiscoveryFilterService` 运行白名单判断与 `akari` ONNX 分类器。从现实线上样本分布来看，泛关键字（如 `VOCALOID`、`ACE Studio`）的搜索结果混杂了大量游戏实况、软件教程、鬼畜二创或非音乐向日常剪辑。

虽然 `5%` 淘汰抽样留存已帮助避免对已知淘汰视频重复请求详情接口，但在首次发现阶段仍消耗了大量 Bilibili HTTP 配额与 ONNX 推理时间。

## 初步构想：三级收窄漏斗

### 第一层：基于分区 (`tid` / `tid_v2`) 的零成本前置筛选

- Bilibili 搜索结果与视频详情均携带主分区及子分区编号（`bilibili_video_metadata.tid` 与 `tid_v2`）。
- 已知绝大多数中文虚拟歌手曲目集中在音乐区（如“演奏”、“翻唱”、“VOCALOID·UTAU”、“电音”、“原创音乐”），极少数分布在动画综合或鬼畜调教边缘分区。
- **候选策略**：
  - 对明确无关的高噪分区（如“知识”、“汽车”、“体育”、“生活日常”等）在搜索摘要阶段直接降权或拦截，不触发后续详情接口抓取；
  - 对核心音乐合成音分区赋予正向先验权重，降低下游分类器的误杀率。

### 第二层：结构化词库与中文分词快车道

- 现有的 `whitelistSingers` 与 `whitelistSongIndicators` 采用简单的子串 `includes` 与 Tag 全等比对，面对中英文混排、缩写（如 `洛`、`V家`、`Sv`）以及负向语境（如“初音未来手办开箱”、“SV教程”）缺乏语义区分能力。
- **候选策略**：
  - 将歌手实体名、声库别称、引擎标识与创作行为动词拆分为结构化词典；
  - 对标题与 Tag 做轻量分词或正则边界匹配，同时显式激活 `blacklistKeywords`（目前默认值留空）拦截纯教程、开箱、直播录屏与纯伴奏切片；
  - 当“强歌手/引擎特征”与“强原创/翻唱曲目特征”同时命中且无负向冲突词时，直接进入高置信收录通道，跳过 ONNX 推理。

### 第三层：模型概率区间三分流

- 目前 `evaluateCandidate` 仅依赖单一阈值 `modelThreshold = 0.5` 做二值切分，导致处于 `0.35 ~ 0.65` 模糊地带的样本要么直接进入追踪队列污染统计，要么被 `95%` 概率直接丢弃。
- **候选策略**：划分高低双阈值，引入三路分流：
  1. `songProbability >= highThreshold`（例如 `0.85`）：自动收录并入列追踪；
  2. `songProbability < lowThreshold`（例如 `0.25`）：自动拒绝并按低比例抽样留存；
  3. 介于双阈值之间的灰区样本：写入 `discovery_sample` 并自动创建 `video_curation` (`status = 'pending'`)，优先呈现给 `ImmersiveLabeler` 人工标注，用于主动学习（Active Learning）持续微调 `akari` 分类器。

## 待讨论的开放问题

1. **搜索结果摘要缺少 Tag**：Bilibili 搜索接口返回的 `SearchVideo` 仅含 `title`、`description` 与 `typeid`（分区），不含完整视频 `Tags`。前置阻断如果误杀跨区投稿（例如发在动画区但 Tag 标明 `VOCALOID中文曲` 的 PV），如何控制漏网率？
2. **词库与编目库联动**：`whitelistSingers` 目前静态存储在 `discovery` 运行时配置中；未来是否应直接定时同步 `packages/db` 中 `core.singer` 的 `name` 与 `localizedNames` 作为基础词源？
3. **重算现有样本影响**：调整阈值或分流区间时，需确保不会对已由人工通过 `video_curation` 裁决的视频产生回溯覆盖。
