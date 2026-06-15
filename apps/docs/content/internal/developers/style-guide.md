---
title: 代码风格指南
description: 档案馆项目的代码风格、架构决策及类型安全规范。
---

## TypeScript 代码规范

- **命名规范**:
    - 变量与函数：使用小驼峰命名法 `camelCase`。
    - 类、接口、类型：使用大驼峰命名法 `PascalCase`。
    - 文件命名：
        - 前端组件、类/接口定义使用 `PascalCase`
            - 如 `UserCard.tsx` 定义 `UserCard` 组件
            - `UserRepository.ts` 定义 `UserRepository` 类
        - 其它源码文件使用 `camelCase`（如 `rateLimitPlugin.ts`）
- **类型声明**:
    - 严禁使用 `any` 与 `z.any()`
    - 严谨在第一方代码中使用`@ts-ignore`与`@ts-expect-error`
    - 定义对象结构和类实现时使用 `interface`；定义联合类型、元组或类型别名时使用 `type`。
- **逻辑组织**:
    - 对于异步操作，统一使用 `async/await`，禁止使用 `.then()` 链式调用。

## 后端开发

- **路由定义**:
    - 严格遵循 RESTful 风格。
    - 路由建议包含 `detail` 描述，以便自动生成 Swagger 文档。
    - 通过 HTTP 状态码区分错误类别，响应体 `code` 细化。
- **输入校验**: 定义统一的 Zod schema 与对应 DTO，并由 Elysia 校验。
- **错误处理**: 通过抛出符合 `AppError` 的错误类以统一错误类型，避免在路由处理函数内直接使用 `try-catch`。

## 数据库规范

- **模型定义**:
    - 字段名使用 `camelCase`，对应数据库映射 `@map` 使用 `snake_case`。
    - 必须包含 `createdAt` 和 `updatedAt` 审计字段。
    - 每个 `model` 必须在末尾包含 `@@map("table_name")` 和 `@@schema("schema_name")`。
- **事务处理**:
    - 涉及多表写入的业务逻辑必须封装在 `$transaction` 中。

## 工程化要求

- **API 集成**:
    - 前端必须使用 Elysia 的 `Eden Client` 访问后端 API。
    - 禁止手动在前端定义后端的 Response 类型，应通过 `typeof app` 直接导出路由类型。
- **代码检查**:
    - TypeScript 检查： `bun typecheck`
    - 运行测试命令：`bun run test`
    - 运行代码格式化：`bun format`
    - 运行 Lint 检查：`bun lint`
- **提交规范**:
    - 提交信息遵循 Conventional Commits。
    - 关于提交信息的具体格式和类型列表，参见 [流程规范](./workflow.md#提交信息)。
