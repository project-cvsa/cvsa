---
title: 网络代理架构
description: 代理类型、请求路由与限速配置
---

网络层负责提供一个网络请求的抽象层，用于将API请求转发到不同的代理后端，并提供限速和流控。

## 代理类型

系统支持4种代理方式：

| 类型            | 用途              | 配置                                        |
| --------------- | ----------------- | ------------------------------------------- |
| **native**      | 直接请求          | 本地网络                                    |
| **alicloud-fc** | 阿里云函数计算    | hangzhou, beijing, shanghai, chengdu 四区域 |
| **cf-worker**   | Cloudflare Worker | 通过CF_ACCESS认证                           |
| **ip-proxy**    | IP代理池          | 外部代理服务（预留）                        |

## 任务路由配置

```typescript
// 任务 → Provider → Proxies 映射
{
  snapshotVideo:        { provider: "bilibili", proxies: ["alicloud_hangzhou", "cf-worker"] },
  snapshotMilestoneVideo:{ provider: "bilibili", proxies: ["alicloud_hangzhou", "cf-worker", "native"] },
  getVideoInfo:         { provider: "bilibili", proxies: ["alicloud_hangzhou", "cf-worker"] },
  getLatestVideos:      { provider: "bilibili", proxies: ["alicloud_hangzhou", "cf-worker"] },
  bulkSnapshot:         { provider: "bilibili", limiters: "bili_normal", proxies: ["alicloud_hangzhou"] }
}
```

## 限速配置

### Bilibili Provider（完整限速）

```typescript
[
  { duration: 1, max: 20 }, // 1秒最多20请求
  { duration: 15, max: 130 }, // 15秒最多130请求
  { duration: 300, max: 2000 }, // 5分钟最多2000请求
];
```

### Bilibili Normal（批量任务限速）

```typescript
[
  { duration: 1, max: 5 }, // 1秒最多5请求
  { duration: 15, max: 40 }, // 15秒最多40请求
  { duration: 300, max: 200 }, // 5分钟最多200请求
];
```

## 请求流程

```
request(url, task)
    ↓
查找task定义 → provider + proxies
    ↓
随机打乱proxies顺序
    ↓
对每个proxy:
    ├── 触发限速器 (provider级别 + proxy级别)
    ├── 执行请求
    │   ├── native → fetch()
    │   ├── alicloud-fc → FC20230330.invokeFunction()
    │   ├── cf-worker → fetch(CF_WORKER_URL, {CF-Access-Auth})
    │   └── ip-proxy → fetch({proxy})
    ├── 成功 → 返回数据
    └── 限速错误 → 尝试下一个proxy
    ↓
所有proxy失败 → NetSchedulerError("NO_PROXY_AVAILABLE")
```

## 错误类型

| 错误码                 | 含义         | 处理               |
| ---------------------- | ------------ | ------------------ |
| **NO_PROXY_AVAILABLE** | 无可用代理   | 抛出，等待重试     |
| **PROXY_RATE_LIMITED** | 代理被限速   | 尝试下一个代理     |
| **FETCH_ERROR**        | 网络错误     | 抛出               |
| **ALICLOUD_PROXY_ERR** | 阿里云FC错误 | 抛出，记录错误计数 |
| **IP_POOL_EXHAUSTED**  | IP池耗尽     | 抛出               |

## 阿里云FC配置

```typescript
{
  endpoint: `fcv3.cn-${region}.aliyuncs.com`,
  function: `proxy-${region}`,
  timeout: 15000
}
```

区域：hangzhou, beijing, shanghai, chengdu

## Cloudflare Worker配置

```typescript
{
  url: process.env.CF_WORKER_URL,
  headers: {
    "CF-Access-Client-Id": process.env.CF_CLIENT_ID,
    "CF-Access-Client-Secret": process.env.CF_CLIENT_SECRET
  }
}
```

## IP代理池（预留）

```typescript
{
  extractor: async () => IPEntry[],  // IP提取函数
  strategy: "single-use" | "round-robin" | "random",
  minPoolSize: 5,
  maxPoolSize: 50,
  refreshInterval: 30000
}
```

## 指标上报

- `ip_proxy_count` / `ip_proxy_error_count`
- `ali_fc_count` / `ali_fc_error_count`
