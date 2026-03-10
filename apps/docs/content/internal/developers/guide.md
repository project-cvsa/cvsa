---
title: 开发者指南
description: 了解如何参与档案馆的开发工作。
---

## 准备环境

档案馆的开发与协作集中在 [GitHub](https://github.com) 上。你需要准备一台能够访问 GitHub 的计算机。

此外，几乎所有主要模块的开发都依赖 [Bun](https://bun.sh) 运行时。你可以通过如下方法来安装 bun 到你的电脑上：

```bash tab="Linux/macOS"
curl -fsSL https://bun.sh/install | bash
```

```bash tab="Windows"
powershell -c "irm bun.sh/install.ps1 | iex"
```

此外，你还需要准备一个 PostgreSQL 18 数据库实例来辅助开发和调试。我们推荐使用 Docker，因为它易于管理和隔离。  
可以参考以下命令启动一个 PostgreSQL 18 容器：

```bash
docker run \
  --name cvsa-db \
  --volume "cvsa-data:/var/lib/postgresql" \
  --restart "always" \
  -p 127.0.0.1:5432:5432 \
  --env "POSTGRES_USER=cvsa" \
  --env "POSTGRES_PASSWORD=password" \
  --env "POSTGRES_DB=cvsa" \
  --env "PGDATA=/var/lib/postgresql/18/docker" \
  --detach \
  "postgres:18-alpine" \
  "postgres"
```

## 克隆仓库

档案馆使用单一代码库 (monorepo)。为了参与开发，首先需要从 GitHub 克隆档案馆的代码仓库：

```bash
git clone https://github.com/project-cvsa/cvsa
```

## 进行开发

每个开发任务都会在 GitHub 仓库以 **issue** 的形式呈现。在挑选（或被分配）一个自己可以完成的 issue 后，就可以开始开发了。

在开始编写代码前，我们需要从 `develop` 分支签出一个新的开发分支。

```bash
git checkout develop
git checkout -b feat/alikia-233-some-changes
```

> 关于分支的命名，参见[流程规范](./workflow.md#分支命名)

之后，进行对应的代码编写。

在编写完成后，需要在根目录运行 `bun run test`，查看测试情况。  
如果所有测试通过，最后别忘了运行 `bun lint` 来查看代码是否符合 lint 规则。  
还可以运行 `bun format` 来确保所有代码都被正确格式化。

完成开发后，可以通过 `git commit -a` 提交。这会打开默认文本编辑器，你需要编写恰当的提交信息描述本次提交。

> 关于提交信息的编写，参见[流程规范](./workflow.md#提交信息)

## 提交拉取请求

代码提交到本地分支后，需要将其推送到 GitHub 远程仓库，并创建拉取请求（Pull Request，简称 PR）以请求合并到主分支。

### 推送分支

首先，将你的开发分支推送到 GitHub：

```bash
git push -u origin feat/alikia-233-some-changes
```

### 创建 PR

前往 GitHub 仓库页面，通常会自动提示你为刚推送的分支创建 PR。如果没有，请手动点击 "New Pull Request" 按钮。

在创建 PR 时，请遵循以下规范：

#### 1. 标题 (Title)

PR 的标题需要与你最终的 commit message 保持一致。由于我们在合并时将使用 "Squash & Merge" 策略，PR 标题将直接成为合并后主分支上的唯一提交信息。

*   **格式**：`<类型>(<范围>): <简短描述>`
*   **示例**：`feat(auth): add two-factor authentication support`
*   **注意**：确保标题清晰、简洁，并能准确概括本次变更的核心内容。

#### 2. 描述 (Description)

PR 的描述部分应包含足够的信息供审查者（Reviewer）理解变更背景和具体内容。推荐使用以下模板结构：

```markdown
## Changes
- 简要列出主要的功能变更或修复点。
- 可以使用列表形式清晰展示。
- 例如：
  - 新增了用户登录的双因素认证接口。
  - 修复了在高并发下会话过期的问题。

## Related
- 关联相关的 Issue 编号，使用 `#` 符号引用。
- 例如：
  - Closes #123
  - Related to #456

## Screenshots (Optional)
- 如果涉及 UI 变更，请提供截图或录屏以辅助审查。
```

### 代码审查 (Code Review)

PR 创建后，项目维护者或其他贡献者将对代码进行审查。你可能需要根据反馈进行修改：

1.  在本地修改代码。
2.  再次运行测试和 lint 检查 (`bun run test`, `bun lint`, `bun format`)。
3.  提交新的 commit 并推送到同一分支 (`git push`)。
4.  GitHub 会自动将新的提交添加到现有的 PR 中。

重复此过程直到所有审查意见得到解决并获得批准（Approval）。

### 合并 (Merge)

当 PR 获得必要的批准且所有自动化检查（CI/CD）通过后，项目维护者将执行合并操作。

档案馆项目对 `develop` 分支使用 **Squash & Merge** 策略：

-   **操作方式**：维护者在合并时会选择 "Squash and merge"。
-   **结果**：你在开发分支上的所有 commit 将被压缩（squash）为一个单独的 commit，然后合并到 `develop` 分支。
-   **提交信息**：这个新生成的 commit 的消息将直接采用你的 **PR 标题**。

### 清理分支

PR 合并后，GitHub 通常会提供删除远程分支的选项。建议及时清理已合并的分支，保持仓库整洁：

```bash
# 删除远程分支
git push origin --delete feat/alikia-233-some-changes

# 切换回 develop 分支并更新
git checkout develop
git pull

# 删除本地开发分支
git branch -d feat/alikia-233-some-changes
```

## 常见问题

**Q: 如果我的 PR 落后于 `develop` 分支怎么办？**  
A: 请在本地执行 `git rebase develop` 来变基你的分支，解决可能出现的冲突，然后强制推送 (`git push --force-with-lease`) 到远程分支。尽量避免使用 `git merge develop`，以保持提交历史的线性整洁。

> 这段是 Qwen 写的，不包对。我现在玩不来 git 了。 ——星寒

**Q: 我可以合并自己的 PR 吗？**  
A: 通常情况下，不允许作者自行合并 PR。你需要至少一位其他贡献者或维护者的批准。~~话说除了星寒以外我们真的会有人做code review吗~~

**Q: 如果我发现已合并的 PR 引入了 Bug 怎么办？**  
A: 请立即创建一个新的 Issue 描述该 Bug，并尽可能提供复现步骤。如果需要修复，请创建一个新的 PR 指向该 Issue。
