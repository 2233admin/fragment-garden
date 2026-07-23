# 碎片花园 Git 工作流 V1.0

## 1. 策略

当前是单人、本地、Codex 辅助开发项目。

第一版采用最简单的策略：

- 主分支固定为 `main`；
- `main` 必须保持可启动、可构建；
- 日常小任务可以直接在 `main` 上完成并小步提交；
- 风险较高或涉及大量重构时，才创建短期分支；
- 不采用 Git Flow；
- 不长期维护 `develop` 分支；
- 不把多个开发阶段压进一个巨大 commit。

---

## 2. 初始化前检查

在终端中检查：

```bash
node --version
npm --version
git --version
```

然后创建 Next.js 项目。

推荐由 Codex 根据当前 `create-next-app` CLI 完成以下配置：

- 项目名：`fragment-garden`；
- TypeScript；
- ESLint；
- Tailwind CSS；
- App Router；
- npm；
- 不使用 `src/`；
- import alias：`@/*`。

创建完成后进入目录：

```bash
cd fragment-garden
```

检查 Git：

```bash
git status
git branch --show-current
```

如果项目还不是 Git 仓库：

```bash
git init -b main
```

如果分支不是 `main`：

```bash
git branch -M main
```

---

## 3. Git 身份

仅在本机尚未配置时执行：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

不要在项目文档或公开截图中暴露不希望公开的私人邮箱。需要公开作品集时，可以使用 GitHub 提供的隐私邮箱。

---

## 4. 必须忽略的内容

`.gitignore` 至少应覆盖：

```gitignore
# dependencies
/node_modules

# Next.js
/.next/
/out/

# production
/build

# local environment and secrets
.env
.env.local
.env.*.local

# keep a key-name-only template
!.env.example

# tests
/coverage/
/playwright-report/
/test-results/

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# local backups and user data
/backups/
/local-data/
/tmp/

# operating systems and editors
.DS_Store
Thumbs.db
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
```

以下内容绝对不得提交：

- OpenAI API Key；
- `.env.local`；
- 真实用户录音；
- 私人截图；
- 本地数据库导出；
- 调试时复制的完整隐私内容；
- 大型构建产物。

`.env.example` 只保存变量名：

```dotenv
OPENAI_API_KEY=
OPENAI_CONTENT_MODEL=
OPENAI_TRANSCRIPTION_MODEL=
OPENAI_EMBEDDING_MODEL=
```

---

## 5. 每次任务开始前

运行：

```bash
git status
git log --oneline -5
```

要求：

- 工作区应当干净；
- 清楚当前基准 commit；
- 不把上一个任务未完成的修改混入新任务。

工作区不干净时，先处理已有修改，不要继续让 Codex覆盖。

---

## 6. 每次任务完成后

依次执行：

```bash
git status
git diff --stat
git diff
npm run lint
npm run typecheck
npm run test
npm run build
```

涉及主流程时，再执行：

```bash
npm run test:e2e
```

确认后暂存：

```bash
git add <本次任务相关文件>
git status
git diff --cached
```

优先明确添加本次相关文件，不要习惯性对混乱工作区使用 `git add .`。

提交：

```bash
git commit -m "feat: add text fragment creation"
```

---

## 7. Commit 类型

采用简化的 Conventional Commits：

| 类型 | 用途 |
|---|---|
| `feat` | 新增用户可感知功能 |
| `fix` | 修复错误 |
| `test` | 新增或调整测试 |
| `docs` | 文档变化 |
| `refactor` | 不改变行为的重构 |
| `chore` | 工具、依赖、配置和维护 |
| `style` | 纯格式或样式调整 |
| `perf` | 性能改进 |

格式：

```text
type: concise description
```

示例：

```text
chore: initialize Next.js project
feat: add local fragment database
feat: render plants in garden scene
fix: preserve fragment when AI analysis fails
test: cover three day dormancy rule
docs: update local backup behavior
```

规则：

- 一条 commit 只表达一个主要意图；
- 使用祈使、简短表达；
- 不使用 `update stuff`、`fix bugs` 等模糊文案；
- 不在 commit message 中写 API Key 或隐私信息；
- 测试失败时不提交“完成”版本。

---

## 8. 什么时候拆 commit

应该拆分：

- 项目脚手架与产品文档；
- 数据 Schema 与 UI；
- 功能实现与无关重构；
- 新功能与修复旧 Bug；
- 依赖升级与业务改动；
- 自动生成素材与代码逻辑。

可以放在同一 commit：

- 一个小功能及其对应测试；
- 一个 Schema 变更及其迁移；
- 一个 Bug 修复及其回归测试。

判断方式：

> 能否用一句明确的话解释这次 commit，并能安全单独回滚？

不能就继续拆分。

---

## 9. 风险任务使用分支

普通小任务直接在 `main`。

以下情况创建分支：

- 大规模重构；
- 更换地图方案；
- 数据库迁移；
- AI 接口重写；
- 导入导出格式升级；
- 需要多轮实验且可能放弃。

创建：

```bash
git switch -c refactor/database-v2
```

完成后：

```bash
git switch main
git merge --no-ff refactor/database-v2
git branch -d refactor/database-v2
```

分支命名：

```text
feat/text-fragments
fix/plant-slot-overlap
refactor/game-bridge
chore/test-setup
```

---

## 10. 安全回滚

### 放弃未暂存的单个文件修改

```bash
git restore path/to/file
```

### 取消暂存但保留文件内容

```bash
git restore --staged path/to/file
```

### 撤销已经提交并保留历史

```bash
git revert <commit-hash>
```

### 查看历史

```bash
git log --oneline --graph --decorate --all
```

不要在不理解影响时使用：

```bash
git reset --hard
git clean -fd
git push --force
```

这些命令可能不可恢复地删除本地修改或改写历史。必须在用户明确确认后才能执行。

---

## 11. Tag 规则

阶段完成后可创建带说明的标签：

```bash
git tag -a m1-card-loop -m "Text fragment and card mode loop complete"
```

查看：

```bash
git tag
```

标签建议：

- `m0-foundation`
- `m1-card-loop`
- `m2-garden-loop`
- `m3-ai-inputs`
- `m4-complete-mvp`
- `v0.1`

---

## 12. GitHub 远程仓库

第一版可以先完全使用本地 Git。

准备备份或作品集时，再创建 GitHub 私有仓库并添加远程：

```bash
git remote add origin <repository-url>
git push -u origin main
```

建议初始设置为私有，原因：

- 项目可能包含未整理的素材；
- 早期提交可能包含调试内容；
- 环境变量配置需要再次检查；
- 作品集说明尚未完成。

公开前必须检查：

```bash
git grep -n "sk-"
git log --all -- .env .env.local
```

同时检查历史中是否曾经提交过密钥或个人内容。仅从最新文件删除并不代表 Git 历史中已经消失。

---

## 13. Codex 的 Git 权限

默认规则：

Codex可以：

- 查看 `git status`；
- 查看 `git diff`；
- 创建和修改代码；
- 运行测试；
- 提议 commit message。

Codex不得在未汇报以下内容前自动提交：

- 修改了哪些文件；
- 实现了什么；
- 哪些测试通过；
- 哪些测试未运行；
- 是否存在风险或未完成项；
- 建议的 commit message。

用户确认后再提交。

Codex不得自行：

- `reset --hard`；
- `clean -fd`；
- force push；
- 改写已有 commit；
- 删除分支；
- 推送远程；
- 创建公开仓库；
- 提交 `.env.local` 或本地用户数据。

---

## 14. 每个 Codex 任务的结束模板

Codex应当按以下格式汇报：

```text
本次完成：
- ...

修改文件：
- ...

验证结果：
- npm run lint：通过/失败
- npm run typecheck：通过/失败
- npm run test：通过/失败
- npm run build：通过/失败
- npm run test:e2e：通过/未运行/失败

尚未完成或风险：
- ...

建议 commit：
- feat: ...
```

没有真实运行的检查不能写“通过”。
