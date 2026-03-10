---
title: 流程规范
description: 了解档案馆的开发工作流和相关规范。
---

## 分支命名

档案馆代码库的分支有两种：

1. 核心分支：采用固定的名称，目前包含 `main` 和 `develop`。
2. 个人分支：开发者自行管理的分支。

个人分支的命名采用`<类别>/<开发者>-<issue编号>-<更改名称>`的格式。
其中：

-   `类别` 代表此次更改的类型，如 feature（功能）、fix（修复）、refactor（重构）等。
-   `开发者` 用于标识该更改的开发人员，避免冲突。你可以使用自己的昵称或 GitHub 用户名，保证它是独一无二的即可。
-   `issue编号` 是该更改对应的 GitHub issue 的编号。
-   `更改名称` 是一个和具体更改内容有关的标识符。

例如：`refactor/alikia-5-better-auth`
代表：该更改是一次重构，由 alikia 进行，对应的 issue 是 #5，更改名称为`better-auth`。

## 提交信息

档案馆项目采用 Conventional Commits 规范来格式化提交信息。

### 基本格式

每条提交信息应遵循以下结构：

```text
<类型>(<可选的作用域>): <描述>

[可选的正文]

[可选的脚注]
```

-   **类型**：必须存在，表示本次提交的类别（见下文“类型列表”）。
-   **作用域**：可选，用括号包裹，指明本次提交影响的代码范围（如模块名、组件名等）。
-   **描述**：必须存在，是对变更的简短说明，使用祈使句、现在时态，首字母小写，末尾不加句号。
-   **正文**：可选，对变更动机及与之前行为的对比进行详细说明。
-   **脚注**：可选，主要用于关联 Issue 或标记破坏性变更（BREAKING CHANGE）。

### 类型列表

以下是项目中允许使用的提交类型：

-   `feat`：新增功能。
-   `fix`：修复 bug。
-   `update`: 对代码内容做出调整，而原先的代码不视为 bug（如修改前端按钮的文案）
-   `docs`：仅修改文档。
-   `style`：修改代码格式（不影响代码运行的变动，如空格、分号缺失等）。
-   `refactor`：重构代码（既不是新增功能，也不是修改 bug 的代码变动）。
-   `perf`：优化性能。
-   `test`：增加测试或修改现有测试。
-   `ci`：修改 CI 配置文件或脚本（例如：Travis, Circle, BrowserStack, SauceLabs）。
-   `chore`：其他不修改源代码或测试文件的更改。
-   `revert`：撤销之前的提交。

### 示例

1.  新增一个用户登录功能：

    ```text
    feat(auth): add user login endpoint
    ```

2.  修复身份验证模块中未处理空值的问题：

    ```text
    fix(auth): resolve unhandled null value in token validation
    ```

3.  包含破坏性变更的提交（需在脚注中标记）：

    ```text
    feat(api): change response format for user details

    BREAKING CHANGE: The 'user' field in the response is now nested under 'data'.
    ```

4.  关联 Issue 的提交：

    ```text
    fix(ui): correct button alignment on mobile devices

    Closes #12
    ```
