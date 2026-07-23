# Codex 第一条开发指令：只完成阶段 0

你现在要初始化《碎片花园》项目。

在执行任何命令前，先完整阅读并遵守：

1. `README.md`
2. `PRD.md`
3. `ARCHITECTURE.md`
4. `AGENTS.md`
5. `DEVELOPMENT_PLAN.md`
6. `GIT_WORKFLOW.md`

本次任务只完成“阶段 0：项目初始化”，不要实现任何产品业务功能。

## 本次目标

创建一个干净、可运行、可构建、可测试的 Next.js 项目，为后续小步开发建立基础。

## 项目配置

- 项目名：`fragment-garden`
- TypeScript
- Next.js App Router
- React
- Tailwind CSS
- ESLint
- npm
- 不使用 `src/` 目录
- import alias 使用 `@/*`
- TypeScript strict
- Phaser 必须锁定为 `3.90.0`

请使用当前安装环境支持的 `create-next-app` 正式 CLI 参数完成初始化。如果 CLI 已经自动初始化 Git，请保留；如果没有，则执行：

```bash
git init -b main
```

确保当前主分支名为 `main`。

## 安装经过批准的依赖

运行前先检查依赖是否已经存在，不重复安装。

运行时依赖：

- `phaser@3.90.0`
- `dexie`
- `dexie-react-hooks`
- `dexie-export-import`
- `zod`
- `openai`
- `cheerio`

开发依赖：

- `vitest`
- `@vitest/coverage-v8`
- `fake-indexeddb`
- `@playwright/test`
- `prettier`
- `eslint-config-prettier`

不要引入其他依赖。遇到确实需要的依赖时先停止并说明原因。

## 需要配置的脚本

在 `package.json` 中确保存在：

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

可以保留 `create-next-app` 生成的等价脚本，但不要删除上述能力。

## 需要创建或检查

1. 根目录保留所有项目文档；
2. 创建 `.env.example`，只包含：
   - `OPENAI_API_KEY=`
   - `OPENAI_CONTENT_MODEL=`
   - `OPENAI_TRANSCRIPTION_MODEL=`
   - `OPENAI_EMBEDDING_MODEL=`
3. 确保 `.env.local` 被 `.gitignore` 忽略；
4. 确保 `coverage`、`playwright-report`、`test-results`、本地备份和临时数据被忽略；
5. 配置 Prettier；
6. 配置 Vitest；
7. 配置 Playwright，但本阶段不需要实现产品 E2E；
8. 添加一个最小的纯函数 smoke test，证明 Vitest 可运行；
9. 首页只展示简短占位信息：
   - 产品名称“碎片花园”
   - “项目基础环境已完成”
10. 不创建数据库 Schema；
11. 不创建 Phaser 场景；
12. 不接入 OpenAI；
13. 不实现碎片、植物、伙伴、卡片或花园功能。

## 验证要求

实际运行：

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

同时检查：

```bash
npm ls phaser
git status
git branch --show-current
```

如果某项失败，先修复；不能修复时如实汇报，不要声称完成。

## Git 要求

本次先不要自动 commit。

完成后请汇报：

```text
本次完成：
- ...

修改文件：
- ...

安装依赖：
- ...

验证结果：
- npm run lint：
- npm run typecheck：
- npm run test：
- npm run build：
- Phaser 版本：
- 当前 Git 分支：

尚未完成或风险：
- ...

建议拆分的 commits：
- chore: initialize Next.js project
- docs: add product and architecture documents
- chore: configure project quality tools
```

等待我检查并确认后，再执行 Git commit。
