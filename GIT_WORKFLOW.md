# 碎片宇宙 Git 工作流

## 基本策略

- 默认分支为 `main`，必须保持可启动、可测试、可构建。
- 普通任务使用 `codex/` 前缀的短期分支。
- Commit 使用简化 Conventional Commits：`feat`、`fix`、`test`、`docs`、`refactor`、`chore`、`style`、`perf`。
- 一条 commit 表达一个主要意图，并能被安全单独回滚。

## 开始前

```bash
git status
git branch --show-current
git log --oneline -5
```

工作区存在未知改动时先确认归属，不覆盖、不回退。

## 提交前

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

涉及主流程时运行相关 Playwright 测试。

## 敏感信息

不得提交 `.env.local`、真实 API Key、IndexedDB 导出、私人内容、测试报告、trace、临时截图、构建产物与本地缓存。

公开前检查：

```bash
git ls-files .env.local
git check-ignore -v .env.local
git grep -n "sk-"
```

不要打印 `.env.local` 内容。

## 历史与远端

- 默认禁止 `reset --hard`、`clean -fd`、force push、删除远端分支和改写提交历史。
- 只有用户明确授权历史重写时才允许执行，并必须先创建项目外 Git bundle。
- 强制更新远端优先使用带明确旧 SHA 的 `--force-with-lease`。
- 不推送本地恢复分支、`refs/codex/*` 或未审计 Tag。
- 仓库重命名后更新 `origin`，并验证可见性、默认分支、Star 数和远程 refs。
