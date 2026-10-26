---
title: 开发者指南
description: 了解如何参与档案馆的开发工作。
---

## 准备环境

档案馆的开发与协作集中在 [GitHub](https://github.com) 上。你需要准备一台能够访问 GitHub 的计算机。

此外，几乎所有主要模块的开发都依赖 [Bun](https://bun.sh) 运行时。可以通过下面命令来在电脑上安装 Bun。

```bash tab="Linux/macOS"
curl -fsSL https://bun.sh/install | bash
```

```bash tab="Windows"
powershell -c "irm bun.sh/install.ps1 | iex"
```

## 克隆代码

从 GitHub 克隆档案馆的代码仓库并切换到 `develop` 分支：

```bash
git clone https://github.com/project-cvsa/cvsa
cd cvsa
git checkout develop
```

## 准备环境变量

在启动任何服务或安装依赖之前，需要先准备好环境配置文件。

```bash
cp .env.docker.example .env.docker

cp packages/db/.env.example packages/db/.env
cp packages/db/.env.example packages/db/.env.test

cp packages/core/.env.example packages/core/.env.test

cp apps/backend/.env.example apps/backend/.env
cp apps/backend/.env.example apps/backend/.env.test
```

为了避免开发和测试环境冲突，你需要将所有 `.env.test` 中的 `DATABASE_URL` 修改为用于测试的数据库。例如：
```bash
# 在 .env 中
DATABASE_URL=postgres://cvsa:password@localhost:5432/cvsa
# 在 .env.test 中
DATABASE_URL=postgres://cvsa:password@localhost:5432/cvsa_test
```

## 启动外部服务

你需要准备一个 PostgreSQL 18 以及 MeiliSearch 1.40 实例来辅助开发和调试。推荐使用 Docker，因为它易于管理和隔离。  
确保你安装了 [Docker Compose](https://docs.docker.com/compose/install/)，之后便可以在根路径下通过 compose 拉起这两个容器。

```bash
docker compose up -d
```

## 初始化项目

在开始开发前，需要安装依赖并运行初始化脚本。

```bash
bun install # 安装依赖
bun setup   # 初始化本地配置与数据库
```

## 进行开发

每个开发任务都会在 GitHub 仓库以 **issue** 的形式呈现。在挑选（或被分配）一个自己可以完成的 issue 后，就可以开始开发了。

在开始编写代码前，我们需要从 `develop` 分支签出一个新的开发分支。

```bash
git checkout develop
git checkout -b feat/alikia-233-some-changes
```

> 关于分支的命名，参见[流程规范](./workflow.md#分支命名)

之后，进行对应的代码编写。下面的说明信息可能有助于你开发。

## 目录结构

档案馆使用 monorepo 方式组织项目：

```
cvsa/
├── apps/
│   ├── backend/			# 主后端
│   ├── docs/				# 文档站点
│   └── web/				# 网站前端
├── packages/
│   ├── core/				# 通用代码
│   ├── db/					# 数据库 schema 与 ORM
│   └── typescript-config/	# tsconfig 配置
├── package.json			# 主配置
└── turbo.json				# Turborepo 配置
```

## 依赖安装与其它命令

在根目录下，运行 `bun i` 以安装所需依赖。

此外，在根目录下，有如下命令可供使用：

```bash
bun run dev				# 启动每个 package 的开发服务器
bun run test			# 运行所有 package 的测试
bun run test:coverage	# 运行测试并报告覆盖率
bun run lint			# 运行 linter
bun run format			# 运行代码格式化
bun run typecheck		# 检查类型错误
```

你也可以切换到某个 package 内执行对应命令。

## 提交与推送

代码开发完成后，请确保通过了本地的 `test` 和 `ci` 任务，随后将其推送到远程仓库并创建指向 `develop` 的 PR。

> 关于提交信息的编写，参见[流程规范](./workflow.md#提交信息)  
> 关于 PR 的格式规范，参见[流程规范](./workflow.md#pr-格式)
