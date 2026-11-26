---
title: "0004: 基于 fanee 的编译期国际化与域名语言路由"
description: 采用 @fanee/tools 静态词条提取、virtual:fanee 构建注入与按域名隔离的双语路由体系，替代运行时远程拉取 JSON 方案。
docType: explanation
---

*Recorded 2026-11-27.* CVSA 将全部业务文案（覆盖后端错误提示与 Web 页面/SolidJS 组件）集中存放在根目录 [locale/](https://github.com/project-cvsa/cvsa/blob/main/locale) 下，采用 **`@fanee/tools` + `@fanee/vite` 编译期提取与打包**、**CI 静态未用词条拦截（`fanee check --unused`）**，并在 `apps/web` 中通过**域名语言前缀**实现 SSR 与客户端同构翻译。

## 背景与约束

CVSA 服务于中文虚拟歌手社区与海外关注者，需同时维护简体中文（`zh-CN`，源语言）与英文（`en-US`）两套界面与接口错误反馈：

1. **SSR 与客户端孤岛同构渲染**：`apps/web` 采用 Astro SSR 结合 SolidJS 客户端交互孤岛（如 `ImmersiveLabeler`、`SongEditForm`）。如果页面首次渲染在服务端完成，随后在浏览器水合，服务端与客户端对同一个 Key 必须输出完全一致的文案，且不能在浏览器首屏额外发起异步 JSON 语言包请求导致界面闪烁（FOUC）。
2. **词条漂移控制**：随着组件快速迭代，极易出现代码里已删除组件但 `locale/` 仍残留无用 Key，或代码中引用了不存在 Key 的情况。
3. **爬虫与后端接口可感知语言**：前端 API 请求需要将当前页面语言传递给 `apps/backend`，使 `AppError` 返回对应语言的错误提示。

## 决策内容

1. **集中式词条目录与编译期虚拟模块**：
   - 根目录 `locale/manifest.json` 声明 `format: "otb"`、`sourceLocale: "zh-CN"`、`targetLocales: ["zh-CN", "en-US"]`，按 `locale/modules/backend` 与 `locale/modules/web` 划分命名空间。
   - [apps/web/astro.config.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/astro.config.ts) 与 `vitest.config.ts` 接入 `@fanee/vite` 插件，在构建时直接将词条内联为 `virtual:fanee` 虚拟模块，零网络请求即可在服务端 `FaneeRuntime`（[server.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/lib/i18n/server.ts)）直接调用。
2. **按页裁剪的 SolidJS 孤岛载荷注入**：
   - 每个 Astro 页面仅声明其需要激活的 `i18nNamespaces`。[payload.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/lib/i18n/payload.ts) 按当前请求语言和默认语言过滤命名空间，经 XSS 安全转义后序列化嵌入页面；自定义的 Astro 集成 [solid-integration.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/lib/i18n/solid-integration.ts) 在服务端和客户端自动用 `FaneeProvider` 包裹 SolidJS 孤岛，使大体积词表（如爬虫控制台多命名空间文案）不会全量下发到普通公开页面。
3. **域名路由与请求头透传**：
   - `i18nMiddleware` 解析站点域名（如 `zh.projectcvsa.com` / `en.projectcvsa.com`，本地 `localhost` 默认走 `zh`），确保同一 URL 在不同语言站点具备独立可索引的地址；[treaty.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/web/src/lib/api/treaty.ts) 自动将 `document.documentElement.lang` 作为 `x-locale` 与 `accept-language` 请求头发送至后端。
4. **CI 静态防线与构建级联**：
   - 根目录 `bun run ci` 强制运行 `bun run i18n:check`（即 `fanee check --unused`），拦截未被引用的静态文案 Key。
   - [apps/deploy/src/plan.ts](https://github.com/project-cvsa/cvsa/blob/main/apps/deploy/src/plan.ts) 将 `locale/` 路径变更标记为全局影响（`isGlobalImpactFile`），确保词条修改触发关联服务镜像重建。

## 备选方案与取舍

- **备选方案一：使用 `i18next` 在客户端按需 `fetch("/locales/...")` 加载 JSON**。实现常见，但会导致客户端孤岛水合阶段存在异步加载间隙或不得不向浏览器暴露全站翻译静态文件，且缺少针对未用 Key 的静态阻断工具链。
- **备选方案二：基于路径前缀 `/zh/...`、`/en/...` 路由**。在已有页面路由下，域名级隔离（`zh.` / `en.`）能够直接配合反向代理缓存与页面静态路径结构，无需在每条 Astro 路由前套用 `[lang]` 动态目录。
- **代价**：为使 `fanee check --unused` 能准确识别引用，动态拼接翻译 Key（如 ``t(`prefix.${key}`)``）会触发 `dynamic-key` 告警；对于枚举映射或动态字段键，需要集中映射或显式列举以保持静态可分析性。

## 影响与后续约束

- 新增或修改 `apps/web` 与 `apps/backend` 用户可见文案时，必须同步更新 `locale/modules/*` 下中英文词条并运行 `bun run ci` 验证无未用或缺失键。
- 避免使用不受控的动态 Key 拼接，优先使用显式键映射对象或独立翻译函数。
