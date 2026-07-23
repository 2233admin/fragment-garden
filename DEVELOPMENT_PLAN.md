# 碎片花园开发计划 V1.0

## 1. 开发原则

第一版采用“小步可运行”的开发方式，而不是一次性生成全部功能。

每个阶段都必须满足：

1. 有明确且有限的任务范围；
2. 形成一个可运行或可验证的结果；
3. 运行该阶段要求的检查；
4. 检查代码差异；
5. 创建清晰的 Git commit；
6. 文档与实现保持一致；
7. 上一阶段验收通过后，再进入下一阶段。

核心顺序：

> 先保证内容可靠保存，再建立卡片闭环，再建立花园闭环，最后接入 AI 和多媒体。

---

## 2. 完成定义

一个阶段只有同时满足以下条件才算完成：

- 需求范围内的功能已经实现；
- 不包含未经确认的额外功能；
- `npm run lint` 通过；
- `npm run typecheck` 通过；
- 相关单元测试通过；
- 涉及主流程时，相关 E2E 测试通过；
- `npm run build` 通过；
- 错误和降级路径已经验证；
- 文档已同步；
- 工作区没有无关修改；
- 已创建清晰的阶段 commit。

---

## 3. 阶段总览

| 阶段 | 目标 | 可验证结果 |
|---|---|---|
| 0 | 项目初始化 | 项目可启动、构建、测试 |
| 1 | 本地数据与领域基础 | 数据可持久化，核心规则可测试 |
| 2 | 文字碎片与卡片闭环 | 可以创建、查看、编辑文字碎片 |
| 3 | 固定花园与植物显示 | 本地碎片能在地图中显示为植物 |
| 4 | 人物移动与植物交互 | 点击移动并打开植物详情 |
| 5 | 成长、休眠、完成与新想法 | 植物状态形成完整闭环 |
| 6 | 伙伴选择与 Chatbot 外壳 | 可选择猫或狗并打开统一聊天面板 |
| 7 | 链接与 AI 内容分析 | 链接可保存、提取、总结并降级 |
| 8 | 图片与语音 | 图片分析和语音转写可用 |
| 9 | 相似碎片与花丛 | AI 建议关联，用户确认后建立关系 |
| 10 | 备份、回归与容错 | 可导入导出，关键流程有自动测试 |
| 11 | 一周自测与 MVP 收口 | 根据真实使用结果修正产品 |

---

# 4. 阶段 0：项目初始化

## 目标

建立一个干净、可运行、可测试、可由 Codex 安全迭代的项目仓库。

## 范围

- 使用 Next.js App Router、TypeScript、Tailwind CSS、ESLint 和 npm 初始化项目；
- 不使用 `src/` 目录；
- 导入 `README.md`、`PRD.md`、`ARCHITECTURE.md`、`AGENTS.md`；
- 安装第一版已经批准的基础依赖；
- 锁定 `phaser@3.90.0`；
- 配置 TypeScript strict；
- 配置 Prettier；
- 配置 Vitest；
- 准备 Playwright 配置，但不要求在本阶段编写业务 E2E；
- 添加 `typecheck`、`test`、`format` 等脚本；
- 创建 `.env.example`；
- 检查 `.env.local`、构建产物和测试产物不会进入 Git；
- 创建最小首页，只说明项目已初始化；
- 不实现碎片、花园、数据库或 AI 业务。

## 验收

- `npm run dev` 可以启动；
- `npm run lint` 通过；
- `npm run typecheck` 通过；
- `npm run test` 通过；
- `npm run build` 通过；
- `phaser` 版本为 3.90.0；
- `.env.local` 不会被 Git 跟踪；
- 文档位于项目根目录；
- 没有提前实现产品功能。

## 建议 commits

```text
chore: initialize Next.js project
docs: add product and architecture documents
chore: configure project quality tools
```

---

# 5. 阶段 1：本地数据与领域基础

## 目标

建立后续所有功能共同依赖的数据层和确定性业务规则。

## 范围

- Dexie 数据库和首个 Schema 版本；
- Settings、Fragment、Attachment、FragmentEvent、Plant、Relation、Cluster、Recommendation 和 ChatMessage 类型；
- Repository 基础接口；
- UUID 与 ISO 时间工具；
- 植物成长纯函数；
- 三天休眠纯函数；
- 完成后永久盛开规则；
- 固定植物槽位分配；
- 使用 fake-indexeddb 测试 Dexie；
- 不制作正式产品 UI。

## 验收

- 数据写入后重新读取一致；
- 浏览器刷新后数据仍存在；
- 创建碎片、植物和事件可以在同一事务完成；
- 成长阶段映射测试通过；
- 三天休眠边界测试通过；
- 完成内容永不休眠；
- 植物槽位不会重复分配；
- 槽位满时不会导致碎片保存失败。

## 建议 commits

```text
feat: add local database foundation
feat: add fragment and plant domain models
test: cover growth dormancy and plant placement
```

---

# 6. 阶段 2：文字碎片与卡片闭环

## 目标

先完成不依赖游戏场景和 AI 的第一个真实可用闭环。

## 范围

- 首次进入的最简状态处理；
- 新建文字碎片；
- 本地自动生成临时标题；
- 立即保存 Fragment、Plant 和 created Event；
- 卡片列表；
- 搜索标题和原始文字；
- 打开碎片详情；
- 编辑标题与文字；
- 添加文字补充；
- 删除采用软删除；
- 基础空状态、加载状态和错误状态。

## 验收

用户可以：

1. 创建一条文字碎片；
2. 刷新页面；
3. 在卡片模式重新找到；
4. 打开并修改；
5. 添加一次补充；
6. 看到成长阶段更新；
7. 删除后不再出现在默认列表。

## 建议 commits

```text
feat: add text fragment creation flow
feat: add fragment card view and search
feat: add fragment detail editing
test: cover text fragment user flow
```

---

# 7. 阶段 3：固定花园与植物显示

## 目标

让本地碎片第一次进入花园世界。

## 范围

- Phaser 动态加载，避免服务端渲染问题；
- BootScene 和 GardenScene；
- 固定地图配置；
- 36 个植物槽位；
- 简单人物、伙伴和植物占位图形；
- React 与 Phaser 的 GameBridge；
- 从 Dexie 生成 PlantViewModel；
- 花园失败时显示卡片模式入口。

## 验收

- 花园 Canvas 正常加载；
- 已有碎片在正确槽位显示为幼苗；
- 新建碎片后，无需刷新即可增加植物；
- 刷新后植物仍在相同槽位；
- 猫或狗形象可根据设置切换；
- Phaser 失败不影响卡片模式。

## 建议 commits

```text
feat: add fixed Phaser garden scene
feat: connect local plants through GameBridge
test: cover plant view model mapping
```

---

# 8. 阶段 4：人物移动与植物交互

## 目标

完成花园模式的基本探索闭环。

## 范围

- 点击可行走区域移动；
- 基础障碍判断；
- 点击植物后移动到 interaction point；
- 到达后通知 React；
- React 打开碎片详情；
- 移动失败时直接打开详情；
- 不实现 WASD、复杂寻路和高级碰撞。

## 验收

- 点击地面后人物移动；
- 不可行走区域不执行错误移动；
- 点击植物后人物靠近；
- 到达后打开正确碎片；
- 移动失败仍能打开内容；
- React 不逐帧控制人物；
- Phaser 不直接读取 Dexie。

## 建议 commits

```text
feat: add click-to-move garden navigation
feat: open fragment details from garden plants
test: cover typed GameBridge events
```

---

# 9. 阶段 5：成长、休眠、完成与新想法

## 目标

完成植物与内容变化之间的核心产品逻辑。

## 范围

- 成长分和阶段更新；
- 同类事件同一天只计一次；
- 三天休眠；
- 再次互动恢复；
- 封存与恢复；
- 标记完成并永久盛开；
- “它最后变成了什么”可选说明；
- “让它长成一个新想法”；
- `grows_from` 关系；
- 花园和卡片状态同步。

## 验收

- 补充内容后植物成长；
- 单日重复同类行为不重复计分；
- 模拟三天后植物进入休眠；
- 重新查看后恢复；
- 完成后永久盛开且不休眠；
- 新想法拥有独立植物并保留来源；
- 原始碎片不会被自动完成。

## 建议 commits

```text
feat: add plant growth state machine
feat: add dormancy archive and completion flows
feat: support growing a new idea
test: cover fragment lifecycle transitions
```

---

# 10. 阶段 6：伙伴选择与 Chatbot 外壳

## 目标

建立猫或狗作为统一 AI Chatbot 入口的产品结构，先不接真实模型。

## 范围

- 首次选择猫或狗；
- 本地保存选择；
- 花园中只显示一个伙伴；
- 猫狗仅替换外观；
- Chatbot 面板；
- 本地固定回复或 Mock；
- 每日推荐入口；
- 推荐一株旧植物的确定性逻辑；
- 伙伴点击打开 Chatbot。

## 验收

- 首次只能选择一个伙伴；
- 刷新后保留选择；
- 猫狗的功能和文案完全一致；
- 点击伙伴打开 Chatbot；
- 推荐可打开对应碎片；
- 用户可以忽略；
- 不存在宠物养成或两套逻辑。

## 建议 commits

```text
feat: add companion onboarding
feat: add unified companion chat shell
feat: add gentle fragment recommendations
```

---

# 11. 阶段 7：链接与 AI 内容分析

## 目标

让外部收藏成为可被理解和回看的碎片。

## 范围

- 链接碎片；
- URL 校验；
- 安全链接抓取；
- title、description、OG 和有限正文提取；
- AI 内容分析；
- 结构化输出与 Zod 校验；
- 后台处理状态；
- 重试；
- 原始 URL 降级保存；
- `.env.local` 使用模型配置，不把模型名散落在业务代码中。

## 验收

- 普通网页可以生成标题和摘要；
- 抓取失败时仍生成植物；
- AI 失败时仍能查看原始 URL；
- 用户可以手动修改标题和摘要；
- API Key 不进入客户端；
- localhost 和私有网络 URL 被拒绝；
- 响应超时和体积限制生效。

## 建议 commits

```text
feat: add safe link preview extraction
feat: add asynchronous AI content analysis
test: cover link and AI failure fallbacks
```

---

# 12. 阶段 8：图片与语音

## 目标

完成 PRD 规定的四种输入类型。

## 范围

- 图片上传；
- 文件类型和大小限制；
- 客户端压缩；
- Blob 存储；
- 图片理解；
- 浏览器录音；
- 音频时长限制；
- 语音转写；
- 转写编辑；
- 媒体失败时保留原始附件；
- 本地容量错误提示。

## 验收

- 图片保存、刷新和预览正常；
- 图片分析失败不丢失原图；
- 录音可以开始、停止和保存；
- 转写结果可以编辑；
- 权限拒绝时有明确提示；
- 超出限制时不会假装保存成功；
- 大媒体不会使用 Base64 写入普通字段。

## 建议 commits

```text
feat: add image fragment support
feat: add audio recording and transcription
test: cover media validation and failure states
```

---

# 13. 阶段 9：相似碎片与花丛

## 目标

用 AI 帮助用户发现关联，但保留用户决定权。

## 范围

- canonical text；
- Embedding；
- 本地余弦相似度；
- 阈值配置；
- 最多三条候选；
- AI 关联解释；
- suggested / confirmed / ignored；
- 建立 related 关系；
- 组成花丛；
- 花丛不合并原始数据；
- 伙伴展示建议。

## 验收

- 新碎片完成分析后出现合理候选；
- 低于阈值不打扰用户；
- 用户确认前不修改关系；
- 忽略后不会反复提示同一建议；
- 组成花丛后成员仍可单独查看；
- 不引入向量数据库。

## 建议 commits

```text
feat: add local similar fragment suggestions
feat: add confirmed relations and clusters
test: cover similarity ranking and user control
```

---

# 14. 阶段 10：备份、回归与容错

## 目标

使 MVP 能稳定自用，并降低浏览器本地数据丢失风险。

## 范围

- 完整导出；
- 完整覆盖导入；
- Zod 备份校验；
- 数据库版本；
- 导入失败事务回滚；
- 清空数据二次确认；
- 关键 E2E；
- AI Mock；
- Phaser 失败降级；
- 本地存储失败提示；
- README 运行说明更新。

## 验收

- 导出文件可重新恢复；
- 非法备份不会破坏现有数据；
- 导入失败后原数据保持；
- 关键闭环 E2E 通过；
- 无 API Key 也可使用非 AI 核心功能；
- 卡片模式始终可访问；
- `npm run build` 通过。

## 建议 commits

```text
feat: add local garden backup and restore
test: add critical end-to-end flows
fix: harden offline and failure fallbacks
docs: update MVP run and backup guide
```

---

# 15. 阶段 11：一周自测与 MVP 收口

## 目标

验证产品，而不是继续堆功能。

## 自测要求

一周内：

- 保存不少于 10 条碎片；
- 覆盖文字、链接、图片和语音；
- 至少 3 天进入花园；
- 回看至少 3 条旧碎片；
- 至少补充 1 条；
- 至少 1 条触发现实行动或发展成新想法。

## 每次记录

- 为什么打开产品；
- 记录是否足够快；
- 是否因为花园而回来；
- 推荐是否有帮助；
- 哪些操作造成压力；
- 花园和卡片分别使用了多少；
- AI 建议是否准确；
- 哪些功能实际没有使用。

## 收口原则

只修复影响核心闭环的问题：

- 无法可靠保存；
- 不愿重新打开；
- 找不到旧内容；
- 花园操作阻碍使用；
- 推荐造成打扰；
- AI 误操作或误导；
- 数据容易丢失。

不在自测阶段增加社交、天气、商店、换装等扩展功能。

## 建议 commits

```text
docs: record first week MVP findings
fix: address core loop usability issues
chore: tag MVP v0.1
```

---

## 16. 里程碑标签

建议在关键节点创建 Git tag：

```text
m0-foundation       阶段 1 完成
m1-card-loop        阶段 2 完成
m2-garden-loop      阶段 5 完成
m3-ai-inputs        阶段 8 完成
m4-complete-mvp     阶段 10 完成
v0.1                一周自测收口
```

标签只在对应阶段测试通过后创建。
