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

> 先保证内容可靠保存，再建立卡片和花园闭环；7B 技术验证后先收敛伙伴 NPC 与思维发芽，再重新评估多媒体。

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
| 6 | 伙伴选择与 Chatbot 外壳（历史实现） | 可选择猫或狗并打开统一聊天面板 |
| 7A | 链接碎片与 GetNoteConnector | 链接先本地保存，再异步读取并可恢复 |
| 7B | 真实 AI 花园伙伴（技术实现完成，过渡） | Responses API、受限工具与本地降级已验证 |
| 8 | 规则型 NPC（已完成） | 固定选项、本地花园数据与现有 Service 形成 NPC 闭环 |
| 9 | 思维发芽（历史实现已完成） | 单 Fragment 的结构化伙伴建议与确认保存技术闭环 |
| 10 | 图片输入完成，语音延期（已收敛） | 图片输入与真实分析可用；语音技术基础保留为 Post-MVP |
| 11 | 内容型卡片与详情收敛（已完成） | Markdown 主体、独立追加笔记和简化阅读闭环 |
| 12 | 链接与图片延迟创建（已完成） | processing job 成功后才创建正式卡片与植物 |
| 13 | 发芽 2.0（已完成） | 生成、预览并确认一张新卡片和一株新植物 |
| 14 | 备份、恢复、稳定性与 MVP 封版（已完成） | 完整备份、安全替换恢复和稳定性收尾 |
| 15 | 像素花园与轻游戏化体验（收尾中） | 环境、内容花、角色与生命周期反馈已完成，进入作品集交付准备 |
| 后续候选 | 相似碎片与花丛 | 待重新规划 |

阶段 8 的规则型 NPC 已完成，普通用户当前通过固定台词、固定选项和本地花园数据
与伙伴互动，不再看到开放输入框或 AI/基础模式切换。阶段 7B 的 OpenAI Route、开放 Chat 组件、ChatMessage、
模式字段和三个受限工具仍作为过渡/开发调试基础设施保留；这不是阶段 7B 失败，也不代表普通 NPC 菜单会
直接请求 OpenAI 或 GetNote。用户从 NPC 进入现有链接创建表单并同意 7A 披露后，链接导入仍可请求 GetNote。

阶段 9 已完成绑定明确 Fragment 的“思维发芽”代码、Mock 验证与真实服务验收，包括本地信息充分性规则、
独立 OpenAI 披露、结构化单方向建议和用户确认保存。真实验收最终使用服务端配置的
`gpt-4.1-mini-2025-04-14`，不发送 reasoning 参数，保持 700 token 输出上限；六次正式请求全部完成并通过
Zod。阶段 10 的图片输入、自动测试、构建和真实分析验收已经完成；语音录制、转写、数据层和自动测试也已实现，但真实
语音兼容链路尚未稳定通过，因此普通创建与重新转写入口已隐藏，语音延期至 Post-MVP / Experimental。该延期不删除
技术基础。阶段 11～14 已按“内容型卡片 → 链接/图片延迟创建 → 发芽生成新卡片 → 完整备份恢复”顺序完成。
阶段 15 的像素花园环境、内容植物、玩家、伙伴和生命周期反馈已实现，当前只做整体体验与作品集收尾。
Embedding、相似碎片和花丛仍是后续候选。

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
阶段 6 完成时仍没有真实 AI、OpenAI Chat Route、链接读取、图片、语音、Embedding、相似碎片或花丛；
其中链接读取随后在阶段 7A 实现，其余能力仍未实现。

这是阶段 6 的当前技术历史，不是现在的普通用户入口。阶段 8 已用规则型 NPC 的固定台词和固定选项承接
推荐、近况、休眠查看、规则说明和种下新想法；开放输入框和聊天线程暂时保留为 7B 过渡能力。

## 建议 commits

```text
feat: add companion onboarding
feat: add unified companion chat shell
feat: add gentle fragment recommendations
```

---

# 11. 阶段 7A：链接碎片与 GetNoteConnector（已完成）

## 目标

让表单或伙伴收到的外部链接先成为可靠的本地碎片，再通过受限 GetNoteConnector 异步读取标题、摘要
和正文；第三方失败不能阻止种植或访问原链接。

## 范围

- 数据库升级到 V3，新增 ExternalLinkImport；
- V2 Settings 自动补 `getNoteDisclosureAcceptedAt = null`；
- 旧 ChatMessage 自动补 `fragmentId = null`；
- URL 只允许 HTTP/HTTPS，拒绝 credentials、localhost、home.arpa、私网和明显保留地址；
- 规范化 URL 并提示重复，用户仍可明确创建副本；
- 首次读取前展示第三方处理说明并本地保存同意时间；
- 在单一 Dexie 事务中创建 Fragment、Plant、created Event 和 ExternalLinkImport；
- 原始 URL 只 trim 后保存，本地创建 Service 不调用网络；
- 新链接立即显示卡片和植物，满槽仍以 `slotId = null` 保存；
- 服务端 GetNoteConnector 仅开放 saveLink、getTaskProgress 和 getNoteDetail；
- `POST /api/link-imports/start` 与 `POST /api/link-imports/progress` 使用 Zod 校验；
- 客户端管理提交、轮询、刷新恢复、离线暂停、完成写回和失败降级；
- `LocalCompanionResponseEngine` 只识别并返回 `IMPORT_LINK` Action；
- 表单和伙伴 Action 执行层共用披露、查重、本地创建和导入 Manager；
- 卡片与详情复用现有 Fragment 生命周期、成长和编辑能力。

`IMPORT_LINK` 和伙伴 Action 是阶段 7A/7B 的技术事实。阶段 8 的固定 NPC 不提供自由链接输入；已有表单和
过渡 Action 继续复用这些本地服务，但不再通过开放自然语言让模型选择工具。

## 数据与事务

- `externalLinkImports.fragmentId` 是唯一索引，重试更新同一记录；
- `normalizedUrl` 是非唯一索引，允许用户确认后“再种一棵”；
- 成功时写入 summary、sourceContent、canonicalUrl、externalNoteId 和截断状态；
- 用户创建时提供或处理中手动修改的标题和正文不被 GetNote 对应字段覆盖；
- 标题与正文分别记录用户所有权，只修改正文时仍可采用 GetNote 标题；
- 链接读取完成不写 `text_added`，不额外增加成长分；
- 失败时 Fragment、Plant、sourceUrl、手工标题和补充内容全部保留；
- 软删除在同一事务中停止未完成导入，迟到结果不会更新已删除内容或追加伙伴通知；
- 完成或失败的伙伴消息携带 fragmentId，并与终态标记同事务写入，刷新后不重复。

## GetNote 安全边界

- Base URL 固定为 `https://openapi.biji.com`；
- 只调用固定 save、task progress 和 note detail 路径，不实现通用代理、搜索、列表、更新或删除；
- `GETNOTE_API_KEY` 与 `GETNOTE_CLIENT_ID` 只从服务端环境变量读取；
- `GETNOTE_LINK_IMPORT_ENABLED=false` 或配置缺失时返回 `service_unavailable`；
- 所有变量都没有 `NEXT_PUBLIC_` 前缀，Key 不返回客户端、不进入日志；
- 单次上游请求 30 秒超时，响应体最大 2 MB；
- Route 请求体最大 8 KB 且只接受 `application/json`，拒绝跨站简单 POST；
- int64 标识符在 JSON 解析前按字符串保护；
- title、summary、sourceContent 和 canonicalUrl 经过裁剪与校验；
- 当前共享 Key 仅适合本地或受保护的少量受控用户，公开部署前必须增加访问控制；
- GetNote 会创建远端笔记副本，当前不会自动删除，用户不应提交不希望第三方处理的私密链接。

## 轮询与重试

- 默认每 10 秒轮询一次；
- 从首次开始最多处理 10 分钟，截止时中止活动请求并忽略迟到结果；
- 单个页面运行时最多同时处理 2 个任务；
- 同一 fragmentId 在 manager 内只排队一次；多 manager 或标签页使用 Web Locks exclusive lock，
  不支持 Web Locks 时使用模块级可取消 FIFO mutex；
- 页面重建后恢复 pending / processing，浏览器恢复在线后继续；
- prepare 只推进 attempt generation，紧邻真实 start 时才增加 attemptCount；
- start 尚未取得 taskId 时保持 pending，刷新中断可用剩余 attempt 恢复；
- poll 与终态写回同时校验 generation 和 taskId，旧任务迟到结果不会覆盖新重试；
- completed、failed 或世代不匹配时 finalize no-op，且不发送重复 UI 或伙伴通知；
- 恢复 processing 时遵守 lastPolledAt 的剩余轮询间隔；
- 组件卸载时取消 timer 和请求；
- 只有 GetNote 明确返回处理失败时自动重新提交一次，自动流程最多 2 次 attempt；
- 第二次显式失败、配置、会员、限流、额度、超时、网络或未知错误后停止；
- 用户可手动重置同一 ExternalLinkImport 并重试，不创建重复 Fragment 或 Plant。

## 验收

- 首次同意后才开始 GetNote，同意保存失败时不创建空记录或调用第三方；
- 合法普通网页、小红书、抖音等分享 URL 能通过本地校验，localhost、私网和危险协议被拒绝；
- Fragment、Plant、created Event 与 ExternalLinkImport 同时成功或全部回滚；
- 链接卡片和植物在第三方完成前立即出现；
- 成功后卡片与共用详情显示标题、来源、摘要、正文和截断状态；
- pending 详情中的未编辑表单会同步后台写回，已编辑字段不会被迟到结果覆盖；
- 失败后原链接、Fragment 和 Plant 可继续查看、编辑和重试；
- 重复链接给出打开已有、再种一棵和取消，不静默创建或阻止；
- 刷新后任务恢复，终态伙伴消息不重复；
- 猫狗使用相同 `IMPORT_LINK` 识别与执行流程；
- 自动化使用 Mock，不访问真实 GetNote。

## 真实验证边界

本阶段已经通过 Mock 覆盖连接器、Route、轮询和降级，但不能据此声称真实 GetNote 账号、会员、额度、
普通网页、小红书或抖音均已验证。真实测试需由项目拥有者在本机 `.env.local` 配置：

```dotenv
GETNOTE_API_KEY=...
GETNOTE_CLIENT_ID=...
GETNOTE_LINK_IMPORT_ENABLED=true
```

Key 不得发送到聊天或输出到终端。真实调用可能创建远端笔记，本阶段不自动删除。

## 阶段 7A 建议 commits

```text
feat: add link fragment persistence
feat: add server-only GetNote connector
feat: add asynchronous link import workflow
feat: support link imports from companion chat
test: cover link import and GetNote fallbacks
docs: document GetNote link import architecture
```

## 阶段 7B：真实 AI 花园伙伴（技术实现已完成，产品入口过渡）

### 目标与范围

阶段 7B 将阶段 6 的本地确定性聊天升级为可降级的真实 AI 伙伴，但不建立通用 Agent。实现范围为：

- 服务端固定 `POST /api/companion/respond`，使用官方 OpenAI Responses API；
- `OPENAI_API_KEY` 仅服务端读取，模型由 `OPENAI_MODEL` 配置，固定 `store: false`；
- 最近最多 20 条有效消息、单条最多 4,000 字符、总计最多 12,000 字符的上下文边界；
- 每回合最多一个严格校验工具：`recommend_fragment`、`open_fragment`、`import_link`；
- 工具由客户端已有推荐、详情和阶段 7A 链接 Service 执行，完成消息确定性写回；
- OpenAI 独立披露、AI/基础模式切换、pending/failed 状态、request id 幂等和刷新恢复；
- 未配置、禁用、超时、限流或模型不可用时保留消息并明确降级基础模式；
- 空链接内容不由模型根据标题、平台或 URL 猜测；猫狗共用 Prompt、模型、工具和逻辑。

阶段 7B 不包含图片、语音、Streaming、OpenAI 远端会话、递归 Agent、多工具并行、Embedding、相似碎片、
花丛或后续规则型 NPC/思维发芽实现。

阶段 7B 验证了服务端 AI、安全边界、受限工具调用和本地持久化能力。阶段 8 已将普通用户入口收敛为
规则型 NPC；旧 Chat UI、Route、ChatMessage 和工具代码暂时保留为不可见调试/迁移能力。这是产品方向调整，
不是阶段 7B 失败。

### 验收

- Context Builder、Prompt、Responses API 客户端、Route、工具白名单、错误映射和本地持久化均有单元测试；
- Playwright 使用 Route Mock 覆盖普通回复、推荐/打开、import_link、失败降级和无障碍植物入口；
- 标准 lint 能在合理时间结束，默认并行 E2E 不依赖临时单 worker；
- `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:e2e`、
  `npm run build` 和 `npm ls phaser` 均通过；
- 自动测试不调用真实 OpenAI 或 GetNote，不提交 `.env.local`、聊天数据、测试报告或真实链接内容。

### 建议 commits

```text
fix: stabilize lint and garden e2e lifecycle
feat: add server-only OpenAI companion
feat: add restricted companion tool calling
feat: add AI mode disclosure and fallback
fix: restore accessible plant opening
test: cover AI companion and tool flows
docs: document real companion architecture
```

---

# 12. 阶段 8：规则型 NPC（已完成）

## 目标

把伙伴从开放聊天入口收敛为花园世界中的规则型 NPC，让用户通过固定选项理解规则、查看近况、回看旧
碎片并种下新想法。NPC 菜单不调用 OpenAI、GetNote 或阶段 7B 的伙伴 Route；链接表单仍沿用阶段 7A 的独立
披露流程。

## 实现范围

- 首次只选择一个猫或狗；猫狗仅外观不同，共用选项、台词、查询和 Action；
- 固定主菜单：推荐旧植物、花园近况、种下新想法、更多、离开；
- 固定“更多”菜单：休眠植物、成长规则、生命周期说明、伙伴台词、返回、离开；
- `domain/companion/npc.ts` 提供有限状态转换、固定模板和稳定台词，不读取数据库；
- 花园近况使用当前最小统计并传递 loading/error 状态，休眠列表通过只读查询读取必要元数据并稳定排序，最多
  展示 5 条；
- 推荐复用既有本地确定性推荐 Service，种下新想法复用现有创建入口；
- 打开推荐或休眠内容复用共享 `FragmentDetailDialog`、`recordFragmentViewed` 和 dormant 恢复规则；
- Canvas 内点击和 Canvas 外无障碍按钮进入同一个 NPC 面板；
- 保留阶段 7B OpenAI Route、ChatMessage、开放 Chat 组件和三个受限工具作为不可见过渡/调试基础设施，
  但普通用户不会通过它们发起请求；
- 不新增数据库表、字段、AI 接口或成长事件。

## 验收

- NPC 没有自由输入框、发送按钮或 AI/基础模式切换；
- 主菜单和“更多”菜单顺序固定，返回、离开和 Escape 行为稳定；
- 花园为空、存在活跃/休眠/完成/封存内容时，模板文案与本地统计一致；
- 休眠列表只展示休眠内容，最多 5 条，键盘可打开共享详情并恢复 active；客户端会再次校验 id 白名单，非法
  id 不调用详情 Service；
- 推荐、打开、忽略和刷新持久化沿用既有本地 Service，不创建重复植物或详情；
- 猫狗行为、文案和网络边界完全一致；NPC 菜单动作不产生 OpenAI、GetNote 或 `/api/companion/respond` 请求；
  进入链接创建表单后的 GetNote 请求继续遵循阶段 7A 披露和 Mock 流程；
- 单元测试和 Playwright 覆盖固定菜单、动态统计、休眠列表、推荐、无障碍入口、猫狗一致性和 Canvas 单实例。

## 完成边界

阶段 8 完成时不包含“思维发芽”，也没有在该阶段新增发芽按钮、API、事件、数据库字段或成长规则。随后
阶段 9 在保持 NPC 普通入口不变的前提下，独立实现了绑定 Fragment 的分析与确认保存闭环。

## 建议 commits

```text
feat: add rule-driven companion NPC
test: cover companion NPC menus and local actions
```

---

# 13. 阶段 9：思维发芽（已完成并通过真实服务验收）

阶段 9 已在共享 Fragment 详情中完成绑定单条内容的思维发芽闭环。它复用阶段 7B 已验证的服务端 OpenAI
基础能力，但使用独立 Route、Prompt、Schema、披露和本地保存事务，不恢复普通用户开放聊天。

## 目标

从共享 Fragment 详情发起一次绑定当前内容的“思维发芽”，先由本地规则判断信息是否足够，再可选调用 AI
返回一个结构化建议。AI 不修改原文、植物阶段或其他碎片；用户确认后才保存建议。

## 实现范围

- 入口位于共享 Fragment 详情，active、dormant、completed、archived 和无槽位的未删除 Fragment 均可使用，
  deleted 不可使用；
- 上下文只包含当前 Fragment 的标题、原文、补充历史、已保存伙伴建议、链接摘要/原文、生命周期、完成状态
  和植物阶段，不读取整个花园、其他 Fragment 或旧 ChatMessage；
- 本地纯规则先识别只有 URL、占位/平台通用标题或没有可理解内容等明显不足情况，直接返回固定提示，不调用
  AI；短但明确的想法不会仅因字数少而被拒绝；
- `buildSproutContext` 确定性裁剪当前内容，总计最多 16,000 个 Unicode 字符，优先保留标题、原文和最新用户
  补充，不调用模型总结上下文；
- 首次发送当前 Fragment 前显示独立 OpenAI 发芽披露，并保存 `sproutAiDisclosureAcceptedAt`；它不继承
  GetNote 或阶段 7B 开放聊天披露；阶段 9 本身不升级数据库，后续阶段 10 再以显式迁移升级到 V4；
- 固定 `POST /api/sprout/analyze` 使用官方 OpenAI Responses API、服务端 `OPENAI_MODEL`、45 秒超时、700 token
  输出上限、`store: false` 和 strict JSON Schema Structured Output；SDK 自动重试关闭，Route 将客户端取消信号
  继续传给上游请求，失败后的重试只由用户明确触发；
- 发芽 Route 不注册工具，不使用 function calling、Conversation API、`previous_response_id`、远端会话、
  Streaming、background mode 或 Agent Loop，也不返回原始 provider 响应；
- 版本化 `sprout-v1` Developer Prompt 与不可信 Fragment user 数据分离，网页正文和用户内容不能覆盖 Prompt 或
  输出 Schema；
- 一次只返回一个具体化方向、一个引导问题和一个允许动作，或者统一的信息不足结果；completed 内容不能推荐
  再次标记完成，服务端和客户端均复验动作兼容性；
- “换个方向”只在当前临时会话携带最近最多 3 个未采纳方向，每次仍是单独请求；旧方向不写库、不创建
  ChatMessage、不增加成长分；
- OpenAI 未启用、未配置、超时、限流、模型不可用或响应无效时显示固定本地引导；NPC、详情和原始内容继续
  可用，不暴露错误堆栈或把失败伪装成已生成建议；
- “按建议继续”只打开现有补充、发展新想法或完成确认流程，不自动执行推荐动作。

## 建议保存与成长

- 建议在用户确认前只存在于当前界面，不写入用户内容；
- 点击“保存这条建议”后才在现有 `fragmentEvents` 中写入 `partner_suggestion_saved`，并由事件投影为来源明确的
  “伙伴建议”补充历史；payload 保存方向、问题、推荐动作、`source: "partner"`、Prompt 版本和本地日期键；
- suggestion id 同时作为事件 id，重复保存同一建议幂等；冲突 id、deleted 状态或不兼容动作会被拒绝；
- 同一 Fragment 按浏览器本地日期每天最多由保存伙伴建议增加一次成长分（+1），同日其他建议仍可保存；打开、
  生成和换方向都不计分；
- Fragment、Plant、`partner_suggestion_saved` 和必要的 `restored` Event 在同一事务中更新，失败完整回滚；
- active 保持 active；dormant 恢复 active；completed 保持完成和永久盛开；archived 保持封存、`slotId = null`，
  不重新占用花园槽位；deleted 不允许分析或保存；
- 保存不覆盖原文或标题，不自动创建子碎片、执行动作、完成、封存或删除。

## 验收与测试

- 单元测试覆盖 readiness、上下文裁剪、Prompt、Responses API Client、Route、独立披露、错误规范化、动作兼容、
  建议保存幂等、每日成长去重和各生命周期状态；
- Playwright 使用 Route Mock 覆盖信息不足不调用 AI、首次披露、结构化建议、换方向、确认保存、状态保持和
  AI 失败降级；
- 自动化测试不调用真实 OpenAI 或 GetNote，不依赖阶段 7B 的开放 Chat UI；
- 阶段 7B 的旧 Chat UI、`/api/companion/respond`、ChatMessage 和三个受限工具继续隐藏保留，没有被删除或
  重新暴露给普通用户；
- 真实 OpenAI 冒烟与自动化验证分开：正式六次 `/api/sprout/analyze` 请求均 HTTP 200，端到端约 2.2～4.6
  秒，输出 65～97 tokens、reasoning tokens 为 0；空链接额外请求为 0，旧 companion 与 GetNote 路径为 0；
- `gpt-5-mini-2025-08-07` 的原失败由 700 个输出额度中的 640 tokens 全部被 reasoning 消耗导致，仅返回
  reasoning item 而没有 `output_text`；最终改用无需 reasoning 参数的 `gpt-4.1-mini-2025-04-14`，没有通过
  放大 token 上限掩盖问题。

## 阶段边界

阶段 9 不包含伙伴真实走到植物旁、正式角色素材、像素动画、观察动画、发芽特效、声音、图片、语音、
Embedding、相似碎片或花丛，也不决定是否删除旧开放聊天代码和 ChatMessage 数据。阶段 10 随后独立实施，
不改变 NPC 入口或开放聊天过渡基础设施。

---

# 14. 阶段 10 收敛：图片完成，语音延期

阶段 10 最初计划补齐图片和语音。10A 图片输入、自动测试、构建与真实图片分析已经完成；10B 的语音录制、转写、
数据层和自动测试已实现，但真实链路尚未稳定通过。当前 MVP 以文字、链接、图片和思维发芽完成核心闭环，语音延期为
Post-MVP / Experimental。浏览器录音、媒体编码、权限和转写兼容成本不再阻塞 MVP 的稳定性与可展示性。
阶段 11～13 后续已完成内容型笔记、延迟创建和发芽 2.0。

## 14.1 共同本地优先边界

- 先在浏览器校验并保存原始 Blob，再在一个 Dexie 事务中创建 Fragment、Plant、MediaAsset 和 `created` Event；
- V3 → V4 迁移只新增 `mediaAssets` 表，保留旧 Fragment、Plant、事件、Settings、ChatMessage、GetNote 和伙伴建议；
- MediaAsset 状态为 `pending`、`processing`、`completed`、`failed`、`local_only`，使用 `clientRequestId` 和
  `processingRequestId` 丢弃晚到响应；刷新不会自动重发，用户可手动重试；
- OpenAI 失败、未配置、用户拒绝披露、无槽位或断网都不能删除媒体、Fragment 或 Plant；媒体分析/转写完成不增加成长分；
- 图片与语音各自保存独立披露同意，不继承旧 Chat、GetNote 或思维发芽同意；原始 Blob 不进入 ChatMessage、Fragment Base64
  或服务端长期存储；
- 图片发芽只读取当前媒体的摘要/可见文字/contentKind 与用户补充，历史语音发芽只读取当前 transcript 与用户补充；发芽 Route
  不接收原始媒体或其他 Fragment。

## 14.2 10A 图片（已完成并通过真实分析验收）

- 单张 PNG/JPEG/WebP，最大 10 MB；通过文件选择或剪贴板粘贴，验证实际可解码，不接受 GIF、SVG、HEIC 或远程 URL；
- 创建界面显示本地预览、文件名、大小、可选标题和补充说明；详情用 Blob URL 预览并在卸载时释放；
- 固定 `POST /api/media/image/analyze`，服务端使用 `OPENAI_IMAGE_MODEL`、Responses API、`input_image`、`store: false`、
  strict Structured Output 和 Zod 二次校验，输出标题、摘要、可见文字和 contentKind；
- 首次发送前显示独立图片披露，可选择同意分析、仅本地或取消；失败和 local-only 均保留原图；系统临时标题才允许被结果更新；
- 10A 验收包括 migration、Blob repository、校验、事务回滚、请求竞态、删除边界、Route 安全、UI 预览/粘贴、刷新恢复和
  真实自制图片分析；这些能力已完成并通过真实验收。

## 14.3 10B 语音技术基础（Post-MVP 未激活）

下列实现和自动测试继续保留，但当前普通创建 Dialog 不显示语音，历史语音详情也不显示新的转写或重新转写入口：

- 只有点击开始录音时才申请麦克风；使用 `getUserMedia` 和 `MediaRecorder.isTypeSupported`，优先 webm/opus、webm、ogg/opus；
- 状态机覆盖 idle、requesting_permission、recording、stopping、preview、saving、error；最长 3 分钟、最大 15 MB；
- 取消、权限失败、空录音、设备错误、Dialog 关闭和卸载都停止 tracks、清理计时器/监听器/Blob URL，且不创建数据；
- 固定 `POST /api/media/audio/transcribe`，服务端使用 `OPENAI_TRANSCRIPTION_MODEL` 和 JSON 转写，只保留非空 transcript；
- `originalTranscript` 保留 provider 原文，`transcript` 可编辑，编辑后重转写必须确认是否覆盖；转写不自动生成第二次 AI 标题；
- 自动测试覆盖受控 MediaRecorder、权限/取消/播放、转写失败、编辑与刷新、独立披露和发芽文字边界；这些结果不代表真实
  麦克风和 provider 链路已经验收通过。未来恢复普通入口前必须重新完成真实麦克风、浏览器编码和 provider 验收。
- 已有 audio Fragment 继续支持 Blob 播放、已有 transcript 查看与编辑，以及只使用 transcript/用户补充的思维发芽兼容。

## 14.4 阶段 10 收敛与未来恢复门槛

按顺序运行 `format:check`、`lint`、`typecheck`、`test`、两次连续 `test:e2e`、`build`、`npm ls phaser`、`npm ls openai` 和
`git diff --check`。自动测试只使用 OpenAI/GetNote Mock；不得提交测试图片、音频、用户数据、报告或 `.env.local`。当前收敛
不创建原计划的 `m3-ai-inputs`，也不创建替代 Tag。语音真实验收改为未来恢复普通入口的门槛，不再阻塞阶段 10 收敛；
阶段 10 收敛后已按顺序完成阶段 11～13。Embedding、相似碎片、花丛、云端媒体、伙伴动画和像素视觉升级仍不得提前实施。

建议 commits：

```text
feat: add local media storage
feat: add image fragment processing
feat: add voice recording and transcription
test: cover image and voice input flows
docs: document local-first media inputs
```

---

# 15. 阶段 11：内容型卡片与详情收敛（已完成）

## 目标

让正式卡片成为可阅读、可编辑的内容型笔记，花园继续独立表现生命周期与成长状态。

## 范围

- Dexie 升级到 V5，一次注册 `fragmentNotes` 与 `contentProcessingJobs`；阶段 11 只启用 notes；
- 为历史和新 Fragment 统一提供 `contentMarkdown`，迁移时确定性转换现有文字、链接、图片和语音内容；
- 合法旧 `text_added` Event 映射为独立 FragmentNote，同时保留 Event；伙伴建议不迁移、不展示；
- 使用安全 Markdown 阅读组件和仅支持段落、标题、粗体、列表、引用、链接的轻量富文本编辑器；
- 详情顶部只保留返回、编辑、删除，链接额外打开原链接；底部提供追加笔记和发芽；
- 追加笔记独立创建、编辑、确认删除，不合并主体；
- 卡片列表只显示标题、主体预览、更新时间及必要的链接/图片/历史语音标识，整卡可点击；
- 生命周期、成长、系统 Event、处理状态和伙伴建议继续保留在底层，但不进入普通卡片与详情。

## 门槛

`format:check`、`lint`、`typecheck`、`test`、`test:e2e`、`build` 与 `git diff --check` 全部通过；历史
Fragment、Blob、关系和状态均可读取，Canvas 最多一个。通过后创建阶段 11 本地 commit，不 push。

实现采用受限 Lexical 编辑器和 `react-markdown` 安全阅读组件，不包含协作、云端或完整 Notion 能力。
阶段 11 门槛已通过；V5 jobs store 当时一并预留，现已由阶段 12 和阶段 13 启用。

---

# 16. 阶段 12：链接与图片处理成功后创建卡片

## 目标

用 V5 processing job 隔离第三方处理中间态，避免失败链接或图片在卡片列表和花园留下空内容。

## 范围

- 启用 `contentProcessingJobs` 的 link/image 分支；job 不属于 Fragment、不占 Plant slot；
- 链接复用 URL 安全、去重、GetNote 披露和固定 connector，保存 provider task identity 并支持刷新恢复；
- 图片 job 保存临时 Blob，复用图片披露与 `/api/media/image/analyze`，新输出主体为 `{ title, markdown }`；
- 成功事务才创建 Fragment、Plant、created Event；图片同时创建唯一 MediaAsset 并清空 job 重复 Blob；
- 失败保留可重试任务，取消删除任务；图片刷新中断后标记可手动重试，不自动重复计费；
- 轻量任务入口、列表、状态、重试、取消和“查看笔记”，但任务不进入正式卡片列表。

## 门槛

文字仍立即创建；链接/图片提交和失败时正式数据数量不变，成功时只增加一次；两轮默认并行 E2E、构建和
`git diff --check` 通过。通过后创建阶段 12 本地 commits，不 push。

阶段 12 已通过自动门槛并创建本地 commits：`bac7d25` 与 `98cb521`。

---

# 17. 阶段 13：发芽 2.0

## 目标

基于当前卡片主体与全部用户追加笔记，生成一篇可编辑的新笔记；只有用户确认后才创建新卡片和新植物。

## 范围

- 保留旧 `/api/sprout/analyze` 与伙伴建议技术实现，普通 UI 改用独立 `/api/sprout/generate`；
- 新 Route 使用 `sprout-generate-v1`、Responses API、`store: false`、strict Schema 和 Zod，只返回
  `{ title, markdown }`；
- sprout job 保存 source snapshot、request identity、生成结果和确认状态；关闭详情不取消任务；
- 上下文只含当前 `contentMarkdown`、全部 user notes、必要来源与已发芽标题；不含伙伴建议、Blob、
  其他 Fragment、生命周期或成长字段；
- 生成结果先预览并用阶段 11 编辑器修改；放弃或失败不创建正式数据；
- 确认事务幂等创建 text Fragment、Plant、created Event 与 confirmed `grows_from` 关系；原卡片内容不变，
  不写 `child_fragment_created` 或 `partner_suggestion_saved`；
- 原卡片和新卡片轻量展示可点击来源关系，新卡片可以再次发芽。

## 门槛

生成、完成、放弃和失败都不提前创建 Fragment；确认只创建一次；source 不变；旧 analyze 普通请求为 0；
图片/语音不发送原始媒体；两轮默认并行 E2E、全量构建与依赖检查通过。通过后创建阶段 13 本地 commits，
不 push、不创建 Tag。

阶段 13 已完成代码、单元测试、普通用户 E2E 和文档；阶段 14 的完整备份恢复与稳定性收尾也已完成。

---

# 18. 相似碎片与花丛（后续候选，暂缓）

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

# 19. 阶段 14：备份、恢复、稳定性与 MVP 封版（已完成）

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

# 20. 一周自测与 MVP 收口（后续候选，待重排）

## 目标

验证产品，而不是继续堆功能。

## 自测要求

以下是阶段 10 后的收口记录，当前自测应覆盖文字、链接、图片和思维发芽；相似碎片和花丛仍待重新规划。

一周内：

- 保存不少于 10 条碎片；
- 覆盖文字、链接和图片；至少确认图片处理失败时原始内容仍可用；
- 回归一条已有 audio Fragment 的播放、transcript 编辑和发芽兼容，不把它视为当前输入验收；
- 至少 3 天进入花园；
- 回看至少 3 条旧碎片；
- 至少补充 1 条；
- 至少使用一次固定 NPC 选项，并对一条选中的碎片请求思维发芽；
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

## 21. 里程碑标签（历史建议，待重新规划）

建议在关键节点创建 Git tag：

```text
m0-foundation       阶段 1 完成
m1-card-loop        阶段 2 完成
m2-garden-loop      阶段 5 完成
m3-ai-inputs        原计划；因语音延期，本次不创建
mvp-v1（示例）      阶段 14 完成并通过 MVP 封版验收后再确定名称
v0.1                一周自测收口（待重新规划）
```

标签只在重新规划后的对应阶段测试通过后创建。本次方向校准不创建 `m3-ai-inputs` 或任何替代 Tag，也不删除已有 Tag。
