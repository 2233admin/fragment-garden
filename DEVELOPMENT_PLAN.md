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

当前阶段 6 已完成，阶段 7 尚未开始。浏览器数据库仍为 V2；阶段 6 直接复用既有
Settings、Recommendation 和 ChatMessage 表，没有新增 V3 或迁移。

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
- 简单静态人物和植物占位图形；
- 仅预留伙伴位置，不渲染猫或狗；
- React 与 Phaser 的 GameBridge；
- 从 Dexie 生成 PlantViewModel；
- 花园失败时显示卡片模式入口。

## 验收

- 花园 Canvas 正常加载；
- 已有碎片在正确槽位显示为幼苗；
- 新建碎片后，无需刷新即可增加植物；
- 刷新后植物仍在相同槽位；
- 人物只在出生点静态显示，不支持移动或场景点击；
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

- 采用 32px、30×20 固定格心网格；
- 使用无第三方依赖的确定性四方向 BFS；
- 点击可行走区域后以 160px/s、delta time 移动；
- 移动途中更换目标时先归正到当前格心，再执行新路线；
- 地图边界、水池、装饰障碍和植物本体格不可走；
- 点击植物后移动到 interaction point；
- 到达后通知 React；
- React 复用卡片模式的查看记录和碎片详情；
- 植物移动失败时直接打开详情，地面失败只提示；
- 可访问植物列表支持绕过人物移动直接打开；
- 直接打开会通过 GameBridge 取消尚未结束的旧植物目标；
- 切换卡片模式时销毁 Canvas，返回后从出生点重建；
- 不实现 WASD、复杂寻路和高级碰撞。

## 验收

- 点击地面后人物移动；
- 不可行走区域不执行错误移动；
- 点击植物后人物靠近；
- 到达后打开正确碎片；
- 移动失败仍能打开内容；
- React 不逐帧控制人物；
- 人物诊断状态仅在状态转换时通过 GameBridge 发送；
- Phaser 不直接读取 Dexie；
- 快速连续点击只执行最后目标；
- 模式切换和 Strict Mode 不产生重复 Canvas、监听或到达事件。

## 建议 commits

```text
feat: add click-to-move garden navigation
feat: open fragment details from garden plants
test: cover typed GameBridge events
```

---

# 9. 阶段 5：成长、休眠、完成与新想法（已完成）

阶段 5 的本地生命周期闭环已完成，并已以 `m2-garden-loop` 标记这一里程碑。阶段 6 也已完成，
但没有新增里程碑标签。

## 目标

完成植物与内容变化之间的核心产品逻辑。

## 范围

- 成长分和阶段继续由 Domain 事件规则计算，同类成长事件同一天只计一次；
- 增加 `dormant` Event，并为 `reviewed`、`completed`、`child_fragment_created`、`archived` 和 `restored` 定义统一、可校验的 payload；
- 在 `/garden` 客户端挂载、窗口 `focus` 和页面重新 visible 时，显式调用 Service 持久化三天休眠转换；
- 休眠同步使用同一个 ISO `now`、运行锁和幂等事务；卡片、详情与花园查询保持只读；
- 提供“仍然感兴趣”“暂时放一放”和“已不需要”的轻量复盘，其中封存或删除必须二次确认；
- 封存和软删除释放植物槽位但保留 Plant；恢复时分配第一个空闲槽，满槽时允许以 `slotId = null` 恢复；
- 数据库升级到 V2，仅修复历史 archived/deleted Fragment 对应 Plant 遗留的 `slotId`，不新增表或索引；
- 将生命周期与完成状态作为独立维度，允许 `completed + archived`；
- 标记完成时可记录“它最后变成了什么”，植物永久盛开且不再休眠；
- 完成后仍可编辑和补充；封存后的查看、编辑、补充、完成和发展新想法都不得隐式恢复父内容；
- “让它长成一个新想法”在单一事务中创建独立 Fragment、Plant、Event 和 confirmed `grows_from` 关系；
- `grows_from` 固定表示 `child (source) grows_from parent (target)`；
- archived 父内容可以派生活跃子内容，但父内容保持 archived 且父 Plant 保持 `slotId = null`；
- 卡片筛选、详情历史和花园投影同步生命周期、完成状态与关系变化。

## 状态与筛选边界

- `current`：所有非 archived、非 deleted 内容，包含 active、dormant 和 completed；
- `dormant`：仅 `lifecycleStatus = dormant`；
- `completed`：`completionStatus = completed` 且 lifecycle 不是 archived/deleted；
- `archived`：所有 `lifecycleStatus = archived` 内容，包含 `completed + archived`；
- completed 内容保持永久盛开、允许继续补充且永不休眠；
- archived 只能通过显式“恢复到花园”变回 active；
- 恢复时即使没有空闲槽位，内容恢复也应成功，卡片模式必须仍可访问；
- archived parent 派生 child 时只恢复和放置 child，不恢复 parent。

## 验收

- 补充内容后植物成长；
- 单日重复同类行为不重复计分；
- 模拟 72 小时后，挂载、focus 或重新 visible 能把符合条件的 active/open 内容持久化为 dormant，并且不会重复写事件；
- live query 和 Query Service 不产生休眠写入，休眠同步失败不阻止读取原内容；
- 查看 dormant 内容或选择“仍然感兴趣”后恢复 active；active 和 archived 内容不产生多余 restored Event；
- “暂时放一放”仅使未完成、未封存内容休眠，完成内容不能进入 dormant；
- “已不需要”在用户最终确认封存或删除前不写库；
- 封存和软删除释放槽位，重复封存不重复写事件；
- archived 内容只有显式恢复才变回 active；恢复选择第一个空闲槽，满槽时以 `slotId = null` 成功恢复；
- V2 迁移只清理历史 archived/deleted Plant 槽位，不丢失 Fragment、Plant、Event 或完成状态；
- 完成后永久盛开且不休眠；完成 archived 内容仍保持 archived，完成后继续补充不改变永久盛开；
- 新想法拥有独立植物并保留正确的 child-to-parent 来源关系；
- dormant 父内容因发展新想法恢复，archived 父内容则保持 archived/无槽位，同时创建 active 子内容；
- 原始碎片不会被自动完成，deleted 父内容不能派生新想法；
- `current`、`dormant`、`completed` 和 `archived` 筛选符合上述定义，deleted 不进入普通 UI；
- 卡片、详情和花园在状态变化后同步，Phaser 不直接读取 Dexie 或计算生命周期；
- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run test`、相关 Playwright E2E 和 `npm run build` 全部通过。

## 完成边界

上述功能、自动化检查和差异审查构成阶段 5 的完成边界；`m2-garden-loop` 标签已创建。阶段 6
在此基础上增加伙伴与本地推荐，没有改变阶段 5 的生命周期规则。

## 建议 commits

```text
feat: add fragment review and dormancy flows
feat: add archive and restore lifecycle
feat: add fragment completion flow
feat: support growing new ideas
test: cover fragment lifecycle user flows
docs: document complete garden lifecycle
```

---

# 10. 阶段 6：伙伴选择与 Chatbot 外壳（已完成）

## 目标

猫或狗现在作为同一个本地 Chatbot 的花园入口；阶段 6 使用确定性本地引擎，没有接入真实模型。

## 范围

- 首次必须选择猫或狗，选择与统一欢迎语在单一事务中本地持久化；
- Settings 缺失时使用默认未完成状态，保存失败不留下部分选择；
- onboarding 完成后不提供更换入口，Service 同样拒绝替换伙伴；
- 花园固定 `companionPosition` 最多渲染一个伙伴，猫狗只以颜色和耳形区分；
- `SET_COMPANION` 只传 `{ type } | null`，`COMPANION_CLICKED` 不携带 Settings 或聊天数据；
- Canvas 点击和 Canvas 外可访问按钮打开同一个 Chatbot 面板；
- `LocalCompanionResponseEngine` 以同一套文案处理使用帮助、成长、休眠、推荐和 fallback；
- 回复引擎不接收 companionType、不读 Dexie、不调用网络，只返回 message 与可选 action；
- `sendCompanionMessage` 通过 Service 原子保存 user、assistant 和真正展示的可选 Recommendation；
- ChatMessage 只有一个本地线程，刷新后仍可按稳定顺序读取，不支持清空或多会话；
- 旧碎片推荐使用纯函数，只选择 active/dormant + open、创建至少 24 小时且当天未展示的内容；
- 推荐按最早互动、最早创建、id 稳定排序，不使用随机、AI、Embedding 或标题判断；
- 每日入口使用浏览器本地日期和 `lastRecommendationDate`，有候选时每天最多主动展示一次；
- 主动聊天请求可继续选择当天未展示的其他候选，不强制打开或修改内容；
- 打开推荐在事务中标记 opened 并复用 `recordFragmentViewed`，然后打开共用详情；
- 忽略推荐只标记 dismissed，不修改生命周期、成长分或原始内容；
- 阶段 6 复用现有 Settings、Recommendation、ChatMessage 表，数据库保持 V2。

## 验收

- 首次只能选择一个伙伴，选择失败可以重试，刷新后不会重复 onboarding；
- 猫狗使用相同位置、点击区域、功能、文案、回复引擎和推荐规则；
- 重复同步或 Strict Mode 重建不会产生两个伙伴、Canvas、欢迎语或每日推荐；
- 点击伙伴或 Canvas 外按钮都能打开同一聊天面板；
- 欢迎语、用户消息和伙伴回复刷新后仍存在且顺序正确；
- 帮助、成长、休眠和推荐意图给出确定性回复，未知输入明确说明能力边界；
- 回复不声称尚未完成的链接、图片或语音已经可用，也不产生 OpenAI 或 GetNote 请求；
- 推荐排除 archived、deleted、completed、新建不足 24 小时和当天已展示的内容；
- 每日推荐无候选时不写记录、不消耗日期，有候选时并发调用也只产生一次；
- 打开 dormant 推荐会写 viewed 并恢复 active，且复用现有 `FragmentDetailDialog`；
- 忽略不修改 Fragment、Plant、成长分或事件；
- 任一聊天、推荐或打开事务失败都不留下部分状态；
- 不存在宠物养成、两套猫狗逻辑、多会话、浏览器通知或强制提醒。

## 完成边界

阶段 6 已完成本地伙伴选择、GameBridge 伙伴呈现、Chatbot 外壳、单线程消息持久化和确定性旧碎片推荐。
当前仍没有真实 AI、OpenAI Chat Route、链接读取、图片、语音、Embedding、相似碎片或花丛。

## 建议 commits

```text
feat: add companion onboarding
feat: add unified companion chat shell
feat: add gentle fragment recommendations
```

---

# 11. 阶段 7：链接与 AI 内容分析（尚未开始）

## 目标

让外部收藏成为可被理解和回看的碎片。

## 范围

- 为 Chatbot 注册输入输出受校验的受限 `import_link` 工具；
- `import_link` 只能通过 `GetNoteConnector` 访问外部链接能力，不能让回复引擎直接访问网络或数据库；
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

以上均为后续计划。当前没有 `import_link`、`GetNoteConnector`、GETNOTE_API_KEY、链接抓取、OpenAI
Chatbot 或得到大脑（GetNote）调用；不得把阶段 6 的本地确定性回复描述成真实 AI。

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
