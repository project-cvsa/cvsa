---
title: 系统规约
description: 跨应用与共享包的核心接口契约、爬虫与策展流水线以及认证授权规约。
docType: explanation
---

当接口格式、状态流转或权限判定跨越多个应用与共享包边界时，对应规约集中记录在本目录，确保后端、爬虫、Web 前端与自动化测试依据同一份契约实现。

- [接口与共享契约规约](./api-and-contracts.md)：`/v2` 路由分组、控制面鉴权、`@cvsa/contracts` Zod Schema 与 `AppError` 错误体系。
- [爬虫发现、策展与追踪规约](./crawler-and-curation.md)：候选发现渠道与筛选策略、运行时开关、双层标注策展与时序追踪状态机。
- [认证与权限模型规约](./auth-and-permissions.md)：邀请制注册流程、会话解析与基于 CASL 的字段级访问控制。
