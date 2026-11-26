---
title: 开放注册后的贡献复核队列与声誉联动构想
description: 探讨在邀请制之外引入公开社区编目、提案复核队列以及与声誉系统联动的早期思路。
docType: explanation
status: draft
---

*Recorded 2026-11-27.* 随着 [认证权限与 Web 协同路线图](/zh/plans/auth-and-web-roadmap) 逐步完善 `meta.permission` 与前端 CASL 联动，平台最终需要支持超出邀请圈层的普通用户参与曲目纠错与歌词补充。本文记录一种轻量的渐进式社区贡献方案。

## 问题缘起

在 [packages/db/src/schema/identity.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/schema/identity.ts) 与 [packages/db/src/schema/meta.ts](https://github.com/project-cvsa/cvsa/blob/main/packages/db/src/schema/meta.ts) 中，数据层早已预留了 `auth.user.reputation` 与 `platform.reputation_history` 两项字段与表结构，但目前尚未绑定任何业务策略；与此同时，当前所有受邀用户均默认为 `editor` 角色，能够直接提交 `SongWriter.update` 修改主表数据。

如果未来全面开放公开注册，直接向所有零信誉新账号授予对 `core.song` 的直接写权限，容易带来破坏性涂改或误操作风险；反之，如果完全禁止普通用户提交修订，又会阻碍社区共同维护歌词、外部链接与冷门曲目资料。

## 初步构想：提案队列与声誉晋升

1. **区分基础贡献者 (`contributor`) 与可信编辑 (`editor`)**：
   - 公开注册的默认角色仅拥有提案（Proposal / Draft）写入或有限字段补充能力，修改不直接覆盖 `core.*` 正式表，而是先进入待复核队列；
   - `editor` 或更高角色在复用 `meta.history` Diff 视图的前提下，一键批准并落库（由事务代为记录原始贡献者与复核者）。
2. **基于 `platform.reputation_history` 的渐进信任**：
   - 当贡献者提交的歌词、外部链接或标签补充多次被采纳后，通过 `reputation_history` 累积积分；
   - 达到阈值后自动或由管理员授予特定细粒度权限（例如通过 `meta.role_permission` 控制对 `STANDARD_SONG_FIELDS` 或歌词的直接编辑权），而无需为每个用户单独维护例外开关。
3. **复用现有的双层思想**：
   - 类似爬虫发现域的 `video_annotation`（多人记录）+ `video_curation`（终局状态）模式，编目域的“修订提案 + 正式生效”同样能清晰保留多方贡献署名与回退依据。

## 待验证的疑问

- 提案是存放在独立的通用 `meta.revision_proposal` JSON 表中，还是按实体拆分？
- 若用户仅补充一条歌词或外部链接，是否需要先开放部分低风险实体（如 `lyrics`、`song_external_link`）免复核写入、仅对主表关键元数据设防？
