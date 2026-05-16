---
alwaysApply: true
scene: git_message
---

在此处编写规则，自定义 AI 生成提交信息的风格。

## 提交信息

档案馆项目采用 Conventional Commits 规范来格式化提交信息。全部内容都使用英文。

### 基本格式

每条提交信息应遵循以下结构：

```text
<类型>(<可选的作用域>): <描述>

[可选的正文（英文）]

[可选的脚注（英文）]
```

-   **类型**：必填，表示本次提交的类别（见下文“类型列表”）。
-   **作用域**：可选，用括号包裹，指明本次提交影响的代码范围（如模块名、组件名等）。
-   **描述**：必填，是对变更的简短说明，使用祈使句、现在时态，首字母小写，末尾不加句号。
-   **正文**：可选，对变更动机及与之前行为的对比进行详细说明。
-   **脚注**：可选，主要用于关联 Issue 或标记破坏性变更（BREAKING CHANGE）。

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

## PR 格式

### 描述

PR 的描述部分应包含足够的信息供审查者理解变更背景和具体内容。推荐使用以下模板结构：

```markdown
## Changes
- 简要列出主要的功能变更或修复点。
- 可以使用列表形式清晰展示。
- 例如：
	- Added login endpoint with email/password authentication and session token management

## Related
- 关联相关的 Issue 编号，使用 `#` 符号引用。
- 例如：
	- Closes #123
	- Related to #456
`

## 类型列表

以下是项目中允许使用的提交与分支类型：

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
