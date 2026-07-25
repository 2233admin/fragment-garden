# 碎片花园架构设计 V1.0

## 1. 架构目标

架构需要同时满足：

1. 完成可以真实使用一周的本地 MVP；
2. 花园具有人物移动和植物交互；
3. 文字、链接、图片、语音、规则型 NPC 和绑定 Fragment 的思维发芽边界清晰可靠；
4. 原始媒体先本地保存，再进行可选的服务端 AI 处理；
5. 后续增加云端能力时，不需要推翻核心业务逻辑。

核心职责：

> React 管产品界面，Phaser 管游戏场景，Domain 管业务规则，Dexie 管本地数据，Route Handlers 管 AI。

---

## 2. 技术栈

- 语言：TypeScript；
- 应用框架：Next.js App Router；
- 产品 UI：React；
- 样式：Tailwind CSS；
- 游戏场景：Phaser 3.90.0；
- 本地数据库：IndexedDB；
- 数据库封装：Dexie.js；
- 导入导出：dexie-export-import；
- 服务端接口：Next.js Route Handlers；
- AI：OpenAI API；
- 校验：Zod；
- 单元测试：Vitest；
- 端到端测试：Playwright；
- 包管理：npm；
- 版本管理：Git。

MVP 阶段锁定 Phaser 3.90.0，不升级到 Phaser 4，不混用不同版本 API。

---

## 3. 总体分层

```text
浏览器
├── React / Next.js Client Components
│   ├── 首次引导
│   ├── 新建碎片
│   ├── 卡片模式
│   ├── 碎片详情
│   ├── 规则型 NPC 对话（阶段 8 当前实现）
│   ├── 思维发芽结果（阶段 9 当前实现）
│   ├── 图鉴
│   └── 设置与导入导出
│
├── GameBridge
│   └── React 与 Phaser 的唯一通信通道
│
├── Phaser 花园
│   ├── 固定地图
│   ├── 人物静态占位（阶段 3）
│   ├── 植物显示
│   ├── 人物鼠标移动与场景交互（阶段 4）
│   └── 猫/狗外观（阶段 6）
│
├── Domain
│   ├── 成长规则
│   ├── 休眠规则
│   ├── 网格、坐标转换与路线计算
│   ├── 推荐规则
│   ├── NPC 有限状态、固定选项与模板规则
│   ├── 相似度规则（后续候选）
│   └── 植物槽位规则
│
└── Dexie / IndexedDB
    ├── 碎片
    ├── 附件
    ├── 植物
    ├── 成长事件
    ├── 关系
    ├── 花丛
    ├── 推荐
    ├── Chat 记录
    ├── 设置
    └── MediaAsset Blob 与处理状态（阶段 10）

Next.js Route Handlers（当前实现与后续候选）
├── 内容分析（历史/候选）
├── 图片理解 `POST /api/media/image/analyze`（阶段 10A）
├── 语音转写 `POST /api/media/audio/transcribe`（阶段 10B）
├── Embedding（后续关联候选）
├── 伙伴过渡 AI Route（阶段 7B 当前实现）
├── 单 Fragment 思维发芽 Route（阶段 9 当前实现）
└── 链接提取
    ↓
OpenAI API
```

阶段 7B 的技术实现已经验证了服务端 OpenAI Responses API、受限工具和本地降级，但它不再是普通用户
入口。`/api/companion/respond`、ChatMessage、开放 Chat 组件和三个工具仍作为过渡/开发调试基础设施保留。
阶段 8 已把用户入口切换为规则型 NPC；阶段 9 已实现绑定单个 Fragment 的思维发芽架构：

```text
规则型 NPC 对话（已实现）
    ↓
固定选项 / 本地 Service

用户选中 Fragment
    ↓
Sprout Analysis Service
    ↓
本地信息充分性规则
    ↓
可选 OpenAI 增强
    ↓
结构化思维发芽建议
    ↓
用户确认保存
```

思维发芽只读取当前选中的 Fragment，AI 不访问 Dexie、不修改 Fragment；用户确认后由本地事务保存伙伴建议，
Phaser 只负责伙伴显示和点击事件。
图片和语音已在阶段 10 接入本地媒体流程；Embedding、相似碎片和花丛仍属于待重新规划的后续候选。

---

## 4. 模块边界

### 4.1 React

负责：

- 页面；
- 表单；
- 弹窗；
- 卡片；
- 搜索与筛选；
- 规则型 NPC 固定对话面板、选项和模板数据；
- Fragment 详情中的思维发芽结果、等待、披露和错误状态；
- 图片选择/粘贴、Blob 预览、图片披露与分析状态；
- 语音录制状态、原始播放、语音披露、转写编辑与重试；
- 数据导入导出；
- AI 状态反馈；
- 通过 GameBridge 向 Phaser 发送数据。

React 不负责：

- 每帧人物位置；
- 碰撞；
- 场景对象排序；
- 植物成长计算。

### 4.2 Phaser

负责：

- 地图初始化；
- 人物移动；
- 可行走区域；
- 点击植物；
- 到达植物后的场景事件；
- 植物、人物和伙伴外观；
- 简单动画。

Phaser 不负责：

- 读取或写入 Dexie；
- 调用 AI；
- 读取碎片正文；
- 计算成长规则；
- 管理产品弹窗。

### 4.3 Domain

纯 TypeScript，负责：

- 成长分数；
- 阶段映射；
- 三天休眠；
- 恢复活跃；
- 推荐旧碎片；
- 外部 URL 安全判断、规范化和临时标题；
- 图片/音频 MIME、大小、尺寸、时长和媒体处理状态的纯校验；
- 相似度阈值（后续候选）；
- 植物槽位分配；
- 状态转换；
- “生长自”关系。

Domain 不依赖 React、Phaser 或 Dexie。

### 4.4 Data

负责：

- Dexie 表；
- 数据库版本；
- 迁移；
- Repository；
- 事务；
- 导入导出；
- Blob 附件。

### 4.5 Services

负责组织多个模块完成用例，例如：

- 创建碎片；
- 批量应用休眠状态；
- 复盘、封存、恢复和软删除；
- 标记完成；
- 从父碎片原子创建新想法及关系；
- 完成唯一伙伴的首次选择并保存统一欢迎语；
- 执行 NPC 固定 Action（推荐、近况、休眠查看、规则说明和种下新想法）；
- 编排绑定 Fragment 的思维发芽、本地信息充分性判断和建议保存；
- 原子保存本地聊天和推荐动作；
- 创建每日非强制旧碎片推荐；
- 打开或忽略推荐；
- 原子创建本地链接碎片并检查重复；
- 原子创建图片或音频 Fragment、Plant、MediaAsset 和 `created` Event；
- 编排 GetNote 提交、轮询、恢复和重试；
- 编排图片分析和语音转写的披露、request id、结果写回、标题保护和手动重试；
- 后台 AI 分析（历史/后续候选，思维发芽除外）；
- 相似候选生成（后续候选）；
- 备份恢复。

### 4.6 Route Handlers

负责：

- 隐藏 API Key；
- 受限 GetNote 链接读取；
- AI 调用；
- 输入输出校验；
- 超时和错误处理。

现有阶段 7B 的 `POST /api/companion/respond` 是固定接口，不是通用代理。它从服务端环境读取
`OPENAI_API_KEY` 和 `OPENAI_MODEL`，使用官方 Responses API、`store: false`、45 秒超时和约 600 token
输出上限；客户端不能提交模型、Base URL、Prompt、工具定义或任意 metadata。请求上下文限制为最近最多
20 条有效消息（单条最多 4,000、总计最多 12,000 字符）、最小花园统计和最多 3 条允许打开的碎片。
模型每回合最多选择一个严格校验的 `recommend_fragment`、`open_fragment` 或 `import_link` 工具；
工具由客户端现有本地 Service 执行，Route 不直接写 Dexie。这些是已完成的过渡能力。校准后的固定 NPC
Action 不经过模型工具选择；阶段 9 的 `POST /api/sprout/analyze` 使用独立协议，只接受当前 Fragment 的
受限字段并返回结构化建议，不复用开放聊天消息、Prompt 或工具。

服务端接口不得直接修改浏览器数据库。

---

## 5. 推荐目录结构

```text
fragment-garden/
├── app/
│   ├── page.tsx
│   ├── garden/page.tsx
│   ├── api/
│   │   ├── companion/respond/route.ts
│   │   ├── sprout/analyze/route.ts
│   │   ├── media/
│   │   │   ├── image/analyze/route.ts
│   │   │   └── audio/transcribe/route.ts
│   │   ├── ai/
│   │   │   ├── analyze-content/route.ts
│   │   │   ├── analyze-image/route.ts（历史候选）
│   │   │   ├── transcribe-audio/route.ts（历史候选）
│   │   │   ├── embedding/route.ts
│   │   │   └── chat/route.ts
│   │   └── link-preview/route.ts
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── onboarding/
│   ├── garden/
│   ├── fragments/
│   ├── companion/
│   │   └── CompanionNpcDialog.tsx
│   ├── encyclopedia/
│   └── settings/
│
├── game/
│   ├── config/
│   ├── scenes/
│   ├── entities/
│   ├── systems/
│   └── bridge/
│
├── domain/
│   ├── companion/
│   │   └── npc.ts
│   ├── sprout/
│   ├── fragments/
│   ├── growth/
│   ├── movement/
│   ├── plants/
│   ├── similarity/
│   └── recommendations/
│
├── data/
│   ├── db.ts
│   ├── schema.ts
│   ├── migrations.ts
│   ├── queries/
│   │   └── companion-npc-query.ts
│   └── repositories/
│
├── services/
├── lib/server/openai/
│   ├── openai-client.ts
│   ├── companion-tools.ts
│   ├── companion-schemas.ts
│   ├── companion-errors.ts
│   └── sprout/
│       ├── sprout-client.ts
│       ├── sprout-context.ts
│       ├── sprout-errors.ts
│       ├── sprout-prompt.ts
│       └── sprout-schema.ts
├── validation/
├── public/assets/
│   ├── map/
│   ├── characters/
│   ├── companions/
│   └── plants/
├── tests/
│   ├── unit/
│   └── e2e/
├── README.md
├── PRD.md
├── ARCHITECTURE.md
├── AGENTS.md
└── package.json
```

---

## 6. 数据模型

### 6.1 Settings

```ts
type Settings = {
  id: "local-user";
  onboardingCompleted: boolean;
  companionType: "cat" | "dog" | null;
  lastOpenedAt: string | null;
  lastRecommendationDate: string | null;
  getNoteDisclosureAcceptedAt: string | null;
  openAiDisclosureAcceptedAt?: string | null;
  companionAiMode?: "local" | "openai";
  sproutAiDisclosureAcceptedAt?: string | null;
  imageAiDisclosureAcceptedAt?: string | null;
  voiceAiDisclosureAcceptedAt?: string | null;
  schemaVersion: number;
};
```

阶段 6 只保存一个本地 Settings 记录。首次选择通过
`completeCompanionOnboarding({ companionType, now })` 在 Settings 与 ChatMessage 的同一事务内完成：

- Settings 不存在时使用未完成 onboarding、`companionType = null` 的默认值；
- 只能提交 `cat` 或 `dog`，成功后同时写入 `onboardingCompleted = true`；
- onboarding 完成后不提供更换入口，Service 也拒绝把已选择的猫改成狗或反向修改；
- 猫和狗只影响外观，不进入回复、推荐或工具逻辑；
- 统一欢迎语只写一次；Settings 或欢迎语任一写入失败时全部回滚。

阶段 7A 使用 `getNoteDisclosureAcceptedAt` 记录用户首次同意第三方处理的时间。未同意时不启动
GetNote；保存同意状态失败时不能假装已经同意。清空本地数据会删除该状态。

阶段 7B 使用独立的 `openAiDisclosureAcceptedAt` 和 `companionAiMode`。V3 旧 Settings 缺少这两个
普通字段时由查询层补 `null` 与 `"local"` 默认值，不增加无意义的数据库版本。GetNote 同意不代表
OpenAI 同意；当前聊天实现默认使用本地引擎，用户明确同意后才切换到 AI 模式。它们是 7B 的过渡兼容字段，
校准后的 NPC UI 不展示 AI/基础模式切换。

阶段 9 使用独立的 `sproutAiDisclosureAcceptedAt`。旧聊天披露和 GetNote 披露都不能替代发芽披露；首次把当前
Fragment 发送给 OpenAI 前必须先保存该字段，保存失败则不发送。它仍是 Settings 的可选非索引字段，V3 旧记录
由查询层补 `null`。

阶段 10 使用独立的 `imageAiDisclosureAcceptedAt` 与 `voiceAiDisclosureAcceptedAt`。它们同样是可选的非索引
Settings 字段；旧 V3 记录由查询层补 `null`，但由于 V4 新增了 `mediaAssets` 表，数据库会显式执行 V3 → V4
迁移。旧的 Chat、GetNote 和思维发芽同意状态都不能代替媒体披露；Settings 写入失败时不发送媒体。

### 6.2 Fragment

```ts
type Fragment = {
  id: string;
  contentType: "text" | "link" | "image" | "audio";

  title: string;
  rawText: string | null;
  sourceUrl: string | null;

  summary: string | null;
  keywords: string[];

  lifecycleStatus: "active" | "dormant" | "archived" | "deleted";
  completionStatus: "open" | "completed";

  analysisStatus:
    | "not_required"
    | "pending"
    | "completed"
    | "failed";

  embedding: number[] | null;
  parentFragmentId: string | null;

  createdAt: string;
  updatedAt: string;
  lastInteractedAt: string;
  completedAt: string | null;
};
```

### 6.3 Attachment

```ts
type Attachment = {
  id: string;
  fragmentId: string;
  kind: "image" | "audio";
  blob: Blob;
  mimeType: string;
  fileName: string;
  sizeBytes: number;

  transcript: string | null;
  extractedText: string | null;
  createdAt: string;
};
```

`Attachment` 是历史附件结构，阶段 10 的主要图片和语音输入使用独立的 `MediaAsset`，以便保留原始 Blob 和处理状态。
代码中的语音 Fragment 使用 `contentType: "audio"`，产品层仍称“语音”，不另建 `voice` 枚举：

```ts
type MediaAsset = {
  id: string;
  fragmentId: string;
  kind: "image" | "audio";
  blob: Blob;
  mimeType: string;
  fileName: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  processingStatus: "pending" | "processing" | "completed" | "failed" | "local_only";
  processingRequestId: string | null;
  errorCode: string | null;
  temporaryTitle: string | null;
  generatedTitle: string | null;
  summary: string | null;
  visibleText: string | null;
  contentKind: "screenshot" | "document" | "photo" | "diagram" | "other" | null;
  transcript: string | null;
  originalTranscript: string | null;
  transcriptEditedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

一个 Fragment 当前最多拥有一个主要 MediaAsset。媒体 Blob 不进入 ChatMessage、Fragment 的 Base64 字段或服务端长期存储；
派生摘要、可见文字和转写与原始媒体分开保存。`local_only` 表示用户明确选择不发送该媒体给 OpenAI。

### 6.4 FragmentEvent

```ts
type FragmentEventType =
  | "created"
  | "viewed"
  | "dormant"
  | "reviewed"
  | "text_added"
  | "link_added"
  | "image_added"
  | "audio_added"
  | "next_step_added"
  | "progress_recorded"
  | "cluster_joined"
  | "child_fragment_created"
  | "partner_suggestion_saved"
  | "completed"
  | "restored"
  | "archived"
  | "deleted";

type TextAddedEventPayload = {
  text: string;
};

type FragmentReviewDecision =
  | "still_interested"
  | "not_now"
  | "no_longer_needed";

type ReviewedEventPayload = {
  decision: FragmentReviewDecision;
};

type CompletedEventPayload = {
  outcome: string | null;
};

type ChildFragmentCreatedEventPayload = {
  childFragmentId: string;
};

type PartnerSuggestionSavedEventPayload = {
  direction: string;
  guidingQuestion: string;
  recommendedAction:
    | "add_content"
    | "record_next_step"
    | "grow_new_idea"
    | "keep_for_later"
    | "mark_completed";
  source: "partner";
  promptVersion: string;
  localDateKey: string;
};

type ArchivedEventPayload = {
  previousSlotId: string | null;
};

type RestoredEventPayload = {
  reason:
    | "viewed"
    | "reviewed"
    | "manual_restore"
    | "content_updated";
};

type FragmentEvent = {
  id: string;
  fragmentId: string;
  type: FragmentEventType;
  payload: Record<string, unknown> | null;
  occurredAt: string;
  ruleVersion: number;
};
```

`text_added`、`reviewed`、`completed`、`child_fragment_created`、`partner_suggestion_saved`、`archived` 和 `restored` 的 payload 都通过统一 Zod Schema 校验。`completed.outcome` trim 后为空时保存为 `null`，长度上限为 300 个字符。读取旧事件时使用安全解析；非法 payload 只跳过对应历史展示，不能让整个详情崩溃。产品界面不得直接假设任意 `Record` 一定包含某个字段。

`dormant`、`reviewed`、`archived`、`restored`、`deleted` 和 `completed` 不增加成长分；完成由 `completionStatus` 决定永久盛开，而不是通过给成长分写入特殊大值。

阶段 9 使用现有 `fragmentEvents` 表记录 `partner_suggestion_saved`，不新增表、索引或数据库版本。打开思维
发芽、生成建议和换方向不增加成长分；只有用户确认保存建议时才记录该事件并增加 +1，同一 Fragment 按浏览器
本地日期每天最多计分一次。事件 ID 同时作为 `suggestionId` 幂等键；建议写入补充历史并标记来源“伙伴建议”，
不覆盖原文或自动执行动作。

### 6.5 Plant

```ts
type Plant = {
  id: string;
  fragmentId: string;

  speciesId:
    | "dandelion"
    | "forget_me_not"
    | "tulip"
    | "sunflower"
    | "lavender"
    | "small_tree"
    | null;

  stage:
    | "seedling"
    | "growing"
    | "budding"
    | "blooming"
    | "permanent_bloom";

  vitality: "active" | "dormant";
  growthScore: number;
  slotId: string | null;

  createdAt: string;
  updatedAt: string;
};
```

### 6.6 FragmentRelation

```ts
type FragmentRelation = {
  id: string;
  sourceFragmentId: string;
  targetFragmentId: string;

  relationType: "similar" | "related" | "grows_from";
  status: "suggested" | "confirmed" | "ignored";

  similarityScore: number | null;
  explanation: string | null;

  createdAt: string;
  confirmedAt: string | null;
};
```

### 6.7 Cluster

```ts
type Cluster = {
  id: string;
  title: string;
  memberFragmentIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

### 6.8 Recommendation

```ts
type Recommendation = {
  id: string;
  fragmentId: string;
  reason: "dormant" | "not_reviewed" | "related_to_recent";
  shownAt: string;
  openedAt: string | null;
  dismissedAt: string | null;
};
```

阶段 6 继续复用该结构，不增加 `status` 字段：

- `openedAt = null` 且 `dismissedAt = null` 表示已展示；
- `openedAt != null` 表示已打开；
- `dismissedAt != null` 表示已忽略。

推荐只有在即将呈现给用户时才写入，不在纯候选计算阶段写库。

### 6.9 ChatMessage

```ts
type ChatMessage = {
  id: string;
  fragmentId: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  source?: "local" | "openai" | "tool" | "system";
  status?: "pending" | "completed" | "failed";
  clientRequestId?: string;
  errorCode?: string | null;
};
```

阶段 6 只有一个本地对话线程，不增加 Conversation 表，不支持新建、切换或清空会话。消息按
`createdAt`、`id` 稳定排序；发送 Service 在一个事务中保存 user 和 assistant 消息，并使用单调时间保证刷新后的阅读顺序。伙伴回复或推荐写入失败时，整个发送事务回滚，不伪造已保存的回复。
阶段 7A 的链接完成或失败消息可通过 `fragmentId` 指向同一 Fragment，刷新后仍可打开共用详情；
普通聊天与旧消息使用 `null`。

阶段 7B 的 user 消息先本地写入，`clientRequestId` 用于幂等和重试；pending 请求不会因刷新而无限重发，
失败只标记为 failed。ChatMessage 不保存 Prompt、API Key、reasoning、完整 provider 响应或 response id。
本地聊天记录是唯一会话事实来源，不依赖 OpenAI 远端会话。

### 6.10 ExternalLinkImport

```ts
type ExternalLinkImport = {
  id: string;
  fragmentId: string;
  provider: "getnote";
  sourceUrl: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  sourceContentTruncated: boolean;
  status: "pending" | "processing" | "completed" | "failed";
  initiatedBy: "form" | "companion";
  taskId: string | null;
  externalNoteId: string | null;
  providerRequestId: string | null;
  attemptCount: number;
  attemptGeneration: number;
  userProvidedTitle: boolean;
  userProvidedContent: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  terminalNotificationStatus: "completed" | "failed" | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  lastPolledAt: string | null;
  completedAt: string | null;
};
```

ExternalLinkImport 独立保存第三方任务状态，不把轮询字段塞进 Fragment。`fragmentId` 是唯一索引，
第一版每个 Fragment 只维护一条 GetNote 导入记录；重试更新同一记录。`normalizedUrl` 是非唯一索引，
用于提示重复，但用户明确选择“再种一棵”时仍可创建副本。`sourceUrl` 保留用户输入的原始链接（只
trim 外围空白），`canonicalUrl` 另存第三方返回的安全规范地址。创建时两个 `userProvided*` 标记
分别记录用户标题和正文的所有权；导入期间只要对应字段被用户实际修改，后续 GetNote 结果就不能覆盖
该字段。只修改正文不会阻止采用第三方标题，未实际变化的保存也不会错误取得字段所有权。
`attemptGeneration` 是本地提交世代；所有轮询和终态写回都同时校验 generation 与 `taskId`，旧任务的
迟到响应因此不能覆盖手动重试或自动重试产生的新任务。

### 6.11 数据库版本 3

阶段 5 首次启用显式历史数据迁移。V2 不增加表或索引，只修复阶段 2 以来可能遗留的退休植物槽位：

```text
Fragment.lifecycleStatus = archived 或 deleted
→ 对应 Plant.slotId = null
```

迁移不物理删除 Fragment、Plant 或 Event，也不修改原始内容、成长分和完成状态。新产生的封存与软删除由各自 Service 在同一事务内立即释放槽位；V2 只负责修复升级前已经存在的数据。

阶段 7A 把 Dexie 升级到 V3，新增 `externalLinkImports` 表，并在升级时为旧 Settings 补
`getNoteDisclosureAcceptedAt = null`、为旧 ChatMessage 补 `fragmentId = null`。V1 到 V3 会依次
执行 V2 与 V3 迁移；现有 Fragment、Plant、Event、Recommendation 和聊天数据完整保留。
Settings 内既有 `schemaVersion = 1` 是该记录自身的版本字段，不随 Dexie V3 强制改写。

### 6.12 数据库版本 4（阶段 10）

V4 只新增 `mediaAssets` 表，索引为：

```text
id, fragmentId, kind, processingStatus, createdAt
```

V3 → V4 不改变既有 ID、Fragment、Plant、fragmentEvents、Settings、ChatMessage、ExternalLinkImport、Recommendation、
伙伴建议或槽位，不重置成长分，也不重新分配植物。升级完成后旧数据库的 `mediaAssets` 为空；新的媒体通过本地事务同时写入
Fragment、Plant、MediaAsset 和 `created` Event。迁移失败必须由 Dexie 回滚，不能删除或部分改写 V3 数据。

---

## 7. 成长状态机

### 7.1 成长分

| 事件 | 分数 |
|---|---:|
| 补充文字 | +1 |
| 添加链接 | +1 |
| 添加图片 | +1 |
| 添加语音 | +1 |
| 写下一步 | +1 |
| 记录现实进展 | +2 |
| 加入花丛 | +1 |
| 发展成新想法 | +2 |
| 保存伙伴建议 | +1 |
| 标记完成 | 直接永久盛开 |

同一种事件同一天最多计算一次成长分。

图片分析和语音转写本身不写入成长事件；图片/语音 Fragment 的后续用户补充、编辑或其他有效行为沿用现有事件规则。
加入花丛和相似关系仍是未来候选；`partner_suggestion_saved` 已实现，不能因为事件枚举存在就视为相似或花丛能力已开放。

### 7.2 阶段

```text
0 分       → 幼苗
1–2 分     → 生长
3–4 分     → 含苞
5 分以上   → 盛开
标记完成   → 永久盛开
```

查看和“仍然感兴趣”不增加分数，只恢复活力。

### 7.3 休眠

```text
completionStatus = completed
→ 不进入休眠

生命周期为 active
+ completionStatus = open
+ 当前时间 - lastInteractedAt >= 72 小时
→ lifecycleStatus = dormant
→ vitality = dormant
→ 写入 dormant Event
```

`shouldFragmentBeDormant` 仍是纯 Domain 判定，不读写数据库。阶段 5 通过显式的 `applyDormancyTransitions({ now })` Service 把判定结果持久化：一次事务批量处理所有符合条件的 Fragment 和 Plant，更新 `updatedAt`，保留原 `lastInteractedAt`，并为每条转换写入一次 `dormant` Event。已经 dormant、archived、deleted 或 completed 的内容不会重复处理。

客户端在以下时机请求同步：

1. `/garden` 工作区首次挂载；
2. 浏览器窗口重新获得 `focus`；
3. 页面从 hidden 变为 visible。

调用层生成并传入同一个 ISO `now`。客户端用运行锁防止 `focus` 与 `visibilitychange` 重入；Service 本身也通过状态条件保持幂等。这里不使用 `setInterval`、Worker、服务端任务或每分钟轮询。

所有 `useLiveQuery` 和 Query Service 保持只读，不在查询函数中触发休眠写入。事务完成后，Dexie live query 负责把卡片、详情和花园更新为持久化后的状态。同步失败只显示非阻塞提示，不删除或隐藏原内容。

### 7.4 生命周期与完成状态

`lifecycleStatus` 和 `completionStatus` 是两个独立维度：

| lifecycleStatus | open | completed | 主花园 |
|---|---|---|---|
| active | 合法 | 合法 | 有槽位时显示 |
| dormant | 合法 | 不合法 | 有槽位时以休眠活力显示 |
| archived | 合法 | 合法 | 不显示 |
| deleted | 可保留 | 可保留 | 不显示 |

`completed + archived` 是合法组合。完成决定植物为 `permanent_bloom`，封存决定它不进入主花园；完成不得把 archived 内容重新放回花园。完成内容永不进入 dormant，但仍可查看、编辑、补充、封存、恢复或发展成新想法。

archived 只能通过“恢复到花园”显式变回 active。查看、编辑、添加补充、标记完成或发展新想法都会更新相应内容和历史，但必须保持父 Fragment 为 archived、Plant 的 `slotId = null`。封存内容不展示普通复盘操作，避免“仍然感兴趣”被误解为自动恢复。

### 7.5 轻量复盘

复盘决策只通过 `reviewFragment` 或最终确认的封存/删除事务写入：

- `still_interested`：写 `reviewed`；dormant 内容恢复 active，并写 `restored { reason: "reviewed" }`；不增加成长分；
- `not_now`：仅适用于未完成、未封存、未删除的内容；立即进入 dormant 并在从 active 转换时写 `dormant`，不等待 72 小时；
- `no_longer_needed`：打开封存/删除二次选择时不写库，只有用户最终确认后，才与 `archived` 或 `deleted` Event 在同一事务写入。

完成内容不提供 `not_now`，因为永久盛开内容不能休眠。查看 dormant 内容时，`recordFragmentViewed` 在同一事务写入 `viewed` 和 `restored { reason: "viewed" }`，恢复 Fragment 与 Plant；active 或 archived 内容只记录查看，不重复写 `restored`。

### 7.6 封存、恢复与软删除

封存和删除都会释放固定槽位，但保留 Plant 记录：

```text
archive
→ lifecycleStatus = archived
→ archived { previousSlotId }
→ Plant.slotId = null
→ Plant.vitality = active

soft delete
→ lifecycleStatus = deleted
→ Plant.slotId = null
→ Fragment、Plant 和事件仍保留
```

重复封存不重复写 `archived` Event。恢复只接受 archived 内容，重新扫描当前占用槽并分配第一个空闲槽；满槽时 Fragment 仍恢复为 active，`slotId = null`，卡片明确提示内容已恢复但暂未放置。恢复不强制使用 `previousSlotId`，并写入 `restored { reason: "manual_restore" }`。

### 7.7 标记完成

`completeFragment` 在同一事务写入经过校验的 `completed { outcome }`，设置 `completionStatus = completed`、`completedAt`、Plant `stage = permanent_bloom` 和 `vitality = active`。未封存内容保持或恢复 active；已封存内容继续 archived 且 `slotId = null`。

完成不修改基于事件计算的 `growthScore`，也不自动封存。完成后仍允许编辑和保存 `text_added`，成长分继续按同类事件每日一次的规则重算，但 `resolvePlantStage` 始终返回 `permanent_bloom`，且不会重复写 `completed` Event。本阶段不提供撤销完成。

### 7.8 发展成新想法

`createChildFragmentFromParent` 在包含 fragments、plants、fragmentEvents 和 relations 的单一事务中：

1. 创建 active/open 的文字子 Fragment、独立 seedling Plant 和 `created` Event；
2. 为父 Fragment 写入 `child_fragment_created { childFragmentId }`，更新互动时间并重算成长分和阶段；
3. 创建 confirmed 的 `grows_from` 关系。

关系方向固定为：

```text
sourceFragmentId = 子 Fragment
targetFragmentId = 父 Fragment
relationType = grows_from
```

即 `child (source) grows_from parent (target)`。父 Fragment 不自动完成；completed 父仍保持 completed。dormant 父恢复 active 时使用 `restored { reason: "content_updated" }`。archived 父也允许派生 active 子内容，但父自身继续 archived，父 Plant 保持 `slotId = null`；其成长分和阶段仍可更新。deleted 父不允许派生。

子 Plant 使用当前第一个空闲槽；满槽时以 `slotId = null` 创建，整个新想法仍成功保存。

### 7.9 卡片、详情与花园投影

卡片状态筛选定义为：

- `current`：所有非 archived、非 deleted 内容，包含 active、dormant 和 completed；
- `dormant`：`lifecycleStatus = dormant`；
- `completed`：`completionStatus = completed` 且 lifecycle 不是 archived/deleted；
- `archived`：`lifecycleStatus = archived`，包含 `completed + archived`。

搜索与排序在状态筛选后继续生效。卡片分别展示生命周期标签和完成标记，不把两个维度压成单一状态。deleted 不进入普通 UI。

详情查询安全解析完成结果、文字补充和父子关系：父详情展示发展出的新想法，子详情展示“生长自”的父标题，非法旧 payload 只跳过对应历史项。

花园继续复用 `PlantViewModel` 和完整 `LOAD_GARDEN` diff：休眠改变 vitality，查看或复盘恢复 active，完成改变 stage，封存/删除移除植物，显式恢复或创建新想法时重新出现。Phaser 不参与任何生命周期计算或数据库写入。

### 7.10 思维发芽边界（阶段 9 当前实现）

思维发芽是思维层面的产品术语，不等同于植物视觉阶段发芽。入口位于共享 `FragmentDetailDialog`，不依赖
Phaser 植物：active、dormant、completed、archived 和 `slotId = null` 的 Fragment 均可使用，deleted 不可使用。

发芽编排只接收当前选中 Fragment 的标题、原文、补充历史、链接摘要/原文、生命周期、完成状态和植物阶段。
它先运行本地信息充分性纯规则：只有 URL、通用平台/占位标题或没有任何可理解内容时直接返回固定的信息不足
结果，不调用 AI；短但明确的想法不会因为字符数较少被拦截。信息充分且用户已接受独立披露时，才调用
`POST /api/sprout/analyze`，返回一个结构化结果：具体化方向、引导问题和一个允许动作（补充内容、记录下一步、
发展成新想法、暂时保留或标记完成）。

AI 不访问 Dexie、整个花园或其他 Fragment，也不直接修改 Fragment、执行动作或切换植物阶段。结果是临时建议，
只有用户确认保存才由本地事务写入 `partner_suggestion_saved` Event，并在补充历史中标记“伙伴建议”。同一 Fragment
按浏览器本地日期每天最多由该事件增加一次成长分，但多条建议仍可保存；dormant 保存后恢复 active，completed
保持永久盛开，archived 保持封存且不占槽位，deleted 不允许分析或保存。保存使用 suggestion id 幂等，任一步骤
失败均完整回滚，不覆盖原文或标题。

---

## 8. 固定地图

阶段 3 使用代码配置的 `960 × 640` 固定逻辑地图，不引入 Tiled 或第三方美术素材。配置集中在 `game/config/garden-map.ts`，包含草地、纵向道路、小水池、玩家出生点、预留伙伴位置、可行走区域、障碍区域和 36 个植物槽位。

地图配置：

```ts
type GardenMapConfig = {
  width: number;
  height: number;
  playerSpawn: { x: number; y: number };
  companionPosition: { x: number; y: number };
  grassAreas: Rectangle[];
  roadArea: Rectangle;
  pondArea: Rectangle;
  walkableAreas: Rectangle[];
  obstacleAreas: Rectangle[];
  plantSlots: PlantSlotConfig[];
};
```

植物槽：

```ts
type PlantSlotConfig = {
  id: string;
  x: number;
  y: number;
  interactionX: number;
  interactionY: number;
};
```

第一版建议预留 36 个槽位。

当前 36 个槽位直接复用领域层的 `slot-01` 至 `slot-36`，每个槽位都有固定显示坐标和为阶段 4 预留的 interaction point。坐标通过单元测试保证完整、唯一、位于地图内、避开道路和水池，并保持最小间距。

阶段 6 在固定 `companionPosition` 渲染唯一伙伴。React 只把已完成 onboarding 的
`{ type: "cat" | "dog" }` 发送给 Phaser；未选择或 Settings 读取失败时发送 `null`，场景不渲染伙伴。猫狗使用相同位置、点击区域、hover 和点击行为，只以简单颜色与耳形占位图区分外观，不移动、不跟随人物，也没有养成状态。

### 8.1 阶段 4 导航网格

阶段 4 在固定地图上使用 `32px` 格心网格：

```text
960 ÷ 32 = 30 列
640 ÷ 32 = 20 行
```

出生点、36 个植物本体格和 36 个 interaction point 均对齐统一格心。场景创建时从 `walkableAreas`、`obstacleAreas` 和固定植物槽生成一次可行走网格并缓存：

- 地图边界不可走；
- 水池和固定装饰树篱不可走；
- 植物本体所在格不可走；
- interaction point 保持可走；
- 道路与草地属于同一连通可行走区域。

开发期校验会验证出生点可行走、interaction point 唯一且可行走、36 个 interaction point 均可从出生点到达，以及道路与水池不重叠。配置不合法时场景初始化失败并回退到现有花园错误状态，而不是在移动逻辑中增加槽位特例。

坐标转换、栅格化、路线推进和四方向 BFS 位于纯 TypeScript 模块，不导入 Phaser。BFS 使用固定邻居顺序，不支持随机、斜向、动态障碍或第三方寻路依赖；相同输入始终返回相同路线。

人物以 `160px/s` 沿格心路线移动，使用 Phaser `update` 的 delta time。新点击会原子替换旧路线；若人物正位于两个格心之间，会先沿原轴回到当前格心，再执行新 BFS 路线，避免重定向产生斜线或切过障碍角。取消的旧目标不发送失败或到达事件。人物位置不逐帧进入 React state。

槽位满时：

- 碎片仍成功保存；
- 植物标记暂未放置；
- 卡片模式仍可用；
- 不因地图容量丢失内容。

### 8.2 花园显示数据

Phaser 只接收为显示准备的 `PlantViewModel`：

```ts
type PlantViewModel = {
  plantId: string;
  fragmentId: string;
  slotId: string;
  title: string;
  speciesId: PlantSpeciesId | null;
  stage: PlantStage;
  vitality: PlantVitality;
  completionStatus: FragmentCompletionStatus;
};
```

React 通过花园查询服务在一个只读事务中批量读取 Fragment 和 Plant，再调用纯函数组装快照。deleted、archived、孤立 Plant 和 `slotId = null` 的植物不会发送给 Phaser；未放置植物只进入 `unplacedPlantCount`。输出按 `slotId` 和 `plantId` 稳定排序，不包含 `rawText`、事件历史或附件。

---

## 9. GameBridge

### 9.1 React → Phaser

```ts
type ReactToGameEvent =
  | { type: "LOAD_GARDEN"; plants: PlantViewModel[] }
  | { type: "ADD_PLANT"; plant: PlantViewModel }
  | { type: "UPDATE_PLANT"; plant: PlantViewModel }
  | { type: "REMOVE_PLANT"; plantId: string }
  | { type: "CANCEL_INTERACTION" }
  | {
      type: "SET_COMPANION";
      companion: { type: "cat" | "dog" } | null;
    };
```

每个 `GardenCanvas` 创建独立 Bridge 实例。React 的 live query 初次和后续变化都发送完整 `LOAD_GARDEN`；`GardenScene` 按 `plantId` 做确定性新增、更新和移除。伙伴选择变化通过独立的
`SET_COMPANION` 同步，重复发送同一类型不会重复创建，类型变化会先销毁旧实例，`null` 会移除实例，因此同一场景最多只有一个伙伴。Bridge 不访问 Dexie 或 React state，场景关闭时取消订阅，组件清理时销毁实例。

植物数据变化不会重置普通地面移动；当前交互目标植物被移除时，Phaser 取消目标并安全发送 `plant_unavailable`。

可访问植物列表直接打开详情时，React 发送 `CANCEL_INTERACTION`，取消 Canvas 中尚未结束的旧植物目标，防止稍后再次触发到达与查看记录。

### 9.2 Phaser → React

```ts
type GameToReactEvent =
  | {
      type: "PLAYER_STATE_CHANGED";
      playerX: number;
      playerY: number;
      movementState: "idle" | "moving";
      selectedPlantId: string | null;
    }
  | {
      type: "MOVEMENT_STARTED";
      targetType: "ground" | "plant";
      targetId?: string;
    }
  | { type: "PLAYER_REACHED_PLANT"; plantId: string }
  | {
      type: "MOVEMENT_FAILED";
      reason:
        | "target_blocked"
        | "path_not_found"
        | "plant_unavailable";
      targetId?: string;
    }
  | { type: "COMPANION_CLICKED" };
```

点击植物流程：

```text
点击植物
→ Phaser 阻止同一次点击继续触发地面移动
→ 计算到固定 interaction point 的 BFS 路线
→ Phaser 控制人物移动
→ 到达 interaction point
→ 发出 PLAYER_REACHED_PLANT
→ React 用 plantId 映射 fragmentId
→ recordFragmentViewed
→ 打开共用 FragmentDetailDialog
```

移动失败且事件包含植物 ID 时，React 使用同一查看记录和详情流程直接打开内容，并提示“暂时无法走到这株植物，已直接为你打开内容”。普通地面失败只显示可访问状态，不打开碎片。

Bridge 为双向独立监听集合，两个方向不会接收到自己的事件。订阅可单独取消，销毁会清空全部监听；Strict Mode 重订阅不会产生重复到达处理。`PLAYER_STATE_CHANGED` 只在初始化、开始、停止、到达、取消或选择变化时发送，供 Canvas 容器更新非敏感诊断属性，不在 Phaser `update` 中逐帧发送，也不进入业务详情处理。

伙伴点击不会触发人物寻路，也不传递 Settings、ChatMessage 或伙伴类型。Phaser 只发出无 payload 的
`COMPANION_CLICKED`。React 当前打开与 Canvas 外“打开花园伙伴”按钮共用的 `CompanionNpcDialog`；即使
Phaser 渲染失败，键盘和屏幕阅读器用户仍可进入同一功能。两个入口都会先取消尚未完成的植物交互，避免
人物随后到达时把碎片详情叠加到 NPC 面板上。

### 9.3 Canvas 生命周期

Phaser 只在 `GardenCanvas` 的客户端 effect 中动态加载。切换到卡片模式时，React Activity 保留卡片搜索、排序和创建状态，同时销毁 Phaser Game、输入监听、路线、Bridge 和 Canvas。返回花园时使用最新快照重建单个 Canvas，人物一致地回到出生点，旧交互目标不会继续。

异步 import 使用取消标记，避免 Strict Mode 或 HMR 留下孤立 Canvas。同一页面最多存在一个 Canvas。测试诊断属性由 GameBridge 的低频状态转换事件更新，只暴露人物坐标、移动状态和选中 plant id，不包含正文或附件，产品逻辑不依赖这些属性。

### 9.4 阶段 6 本地 Chatbot 与推荐边界（当前过渡实现）

以下是阶段 6/7A 已完成的开放输入和本地 Action 技术事实，不再是普通用户入口。阶段 8 的固定 NPC 选项
直接触发现有本地 Service；不得把这些旧 Action 扩展成模型自由生成的通用工具。

本地回复引擎是无状态纯 TypeScript：

```ts
type CompanionAction =
  | { type: "RECOMMEND_FRAGMENT" }
  | { type: "IMPORT_LINK"; url: string };

type CompanionResponse = {
  message: string;
  action: CompanionAction | null;
};
```

`LocalCompanionResponseEngine` 只接收用户文本，不接收 `companionType`，不访问 Dexie、Phaser、React、
网络或外部模型。阶段 6 建立了使用帮助、真实成长规则、72 小时休眠规则、旧碎片推荐和有界 fallback；
阶段 7A 只增加确定性的 URL 识别与 `IMPORT_LINK` Action。阶段 7B 保留该引擎作为基础模式和服务降级路径；
图片和语音处理不经过该开放聊天引擎，而由阶段 10 的独立媒体 Service 负责。

回复引擎只产生 action，应用 Service 或受限 Action 执行层负责执行：

```text
用户消息
→ 本地回复引擎生成 message + action
→ Service 执行可选 RECOMMEND_FRAGMENT，或 Action 层执行受限 IMPORT_LINK
→ user、assistant 与真正展示的 Recommendation 原子写入
→ React 通过 live query 更新消息和推荐卡片
```

旧碎片候选由 `selectFragmentRecommendation` 纯函数计算：

- 只包含 lifecycle 为 active 或 dormant 且 completion 为 open 的 Fragment；
- archived、deleted、completed 和创建不足 24 小时的内容均被排除；
- 排除浏览器本地日期当天已经展示过的 Fragment；
- 依次按最早 `lastInteractedAt`、最早 `createdAt`、`id` 稳定升序，返回第一条；
- 不使用随机、AI、Embedding、标题判断，也不修改传入数组。

用户主动在聊天中请求推荐时可选择当天尚未展示的下一条内容；每日主动入口另外以
`Settings.lastRecommendationDate` 限制每个浏览器本地日期最多展示一次。每日 Service 在
Settings、Fragment 和 Recommendation 的同一事务内检查并写入日期，兼容 Strict Mode 并发重入；没有候选时不写 Recommendation，也不消耗当天机会。入口只提供温和建议，不使用通知、定时任务、连续天数或强制操作。

打开推荐时，`openFragmentRecommendation` 在单一事务中把 Recommendation 标记为 opened，并复用
`recordFragmentViewed` 写入 viewed、恢复 dormant 内容，再由 React 打开共用
`FragmentDetailDialog`，不会创建伙伴专用详情。忽略只写 `dismissedAt`，不改变 Fragment、Plant、生命周期、成长分或事件。任一事务步骤失败都回滚，卡片模式和普通详情入口继续可用。

### 9.5 阶段 7B 真实 AI Chatbot 边界（当前过渡实现）

本节描述已完成的服务端 AI、安全边界和工具调用能力。开放聊天、AI/基础模式切换和三个工具暂时保留为
不可见调试/迁移基础设施，校准后的普通用户不通过它们发起开放请求。

真实 AI 通过 `POST /api/companion/respond` 接入。服务端使用固定版本的 developer Prompt
`companion-v1`、官方 Responses API、服务端 `OPENAI_MODEL`、`store: false`、45 秒超时和约 600 token
输出上限；不使用 Conversation API、`previous_response_id`、streaming 或递归 Agent Loop。Prompt 不接收
`companionType`，猫狗因此共用完全相同的模型、语气、工具和行为。

上下文由纯函数 `buildCompanionContext` 构建：仅保留当前本地会话最近 20 条有效 user/assistant 文本消息，
单条最多 4,000 字符、总计最多 12,000 字符，并附最小 `GardenSummary` 与最多 3 条
`allowedOpenFragments` 元数据。不发送全部 Fragment、正文、taskId、externalNoteId 或网页提取指令。

模型只可调用三个严格工具，且每回合最多一个：

- `recommend_fragment`：客户端调用既有推荐 Service；
- `open_fragment`：服务端和客户端都验证 fragment id 属于允许列表，再打开共用详情；
- `import_link`：客户端复用阶段 7A 的 URL 校验、披露、查重和本地优先导入流程；服务端还要求 URL
  能在本次会话的用户消息中找到，避免模型凭空触发远端读取。

工具执行结果和完成消息由客户端本地 Service 确定性产生，模型未经成功结果不得声称操作完成。OpenAI
启用前必须单独获得用户披露同意；未配置、禁用、超时、限流或模型不可用时保留用户消息并允许切回
`LocalCompanionResponseEngine`，不伪装成 AI 成功。链接只有标题而没有摘要或正文时，伙伴必须明确说明
内容不足，不能根据平台或 URL 猜测正文。

### 9.6 阶段 8 NPC 与阶段 9 思维发芽当前实现

阶段 8 已实现固定 NPC 对话面板。`domain/companion/npc.ts` 定义有限屏幕状态、固定主菜单和“更多”菜单、
花园近况模板、固定规则说明及无随机的伙伴台词；`CompanionNpcDialog` 只渲染这些状态和选项，不提供自由
输入或 AI/基础模式切换。推荐复用既有确定性推荐 Service；近况使用 React 已有的最小花园统计，并显式
传递 loading/error 状态；休眠列表通过只读查询取得必要元数据，按最近互动、创建时间和 id 稳定排序，最多
展示 5 条。打开推荐或休眠内容仍复用共享 `FragmentDetailDialog` 和 `recordFragmentViewed` 规则；种下新
想法复用现有创建入口。休眠项的 id 在客户端再次与当前白名单比对，非法 id 不调用详情 Service。

NPC 菜单和本地 Action 不调用 OpenAI、GetNote 或 `/api/companion/respond`；“种下新想法”打开现有链接表单后，
仍按阶段 7A 的独立披露流程启动 GetNote。猫狗只把外观类型传给标记组件，Domain、选项、台词、查询和本地动作完全相同。阶段 7B 的开放 Chat 组件、Route、ChatMessage、模式字段和三个受限
工具继续保留为不可见的过渡/开发调试基础设施，但不参与当前 NPC 请求路径。

阶段 9 的思维发芽从共享 `FragmentDetailDialog` 发起，先显示“伙伴正在过来看看”的短暂等待状态：

```text
选中 Fragment
→ Sprout Analysis Service
→ 本地信息充分性规则
→ 可选 OpenAI Route（只读当前 Fragment）
→ 结构化单方向建议
→ 用户确认保存到补充历史
```

AI 返回的建议必须通过 Zod 校验，且只包含具体化方向、引导问题和一个允许动作。AI 不访问 Dexie，不读取
全园或无关内容，不直接修改 Fragment、执行动作或改变 Plant stage。OpenAI 不可用时由本地基础规则生成固定
提示或基础结果；建议未被确认前不写库、不增加成长分。“换个方向”只携带最近最多 3 个未采纳方向并发起新的
单次请求，不保存旧方向，也不创建 ChatMessage。正式角色走到植物旁、观察动画和发芽特效不属于阶段 9。
Sprout Analysis 使用独立 server-only Client、Prompt、Schema、错误规范化和披露边界，不复用开放聊天入口，
也不让模型选择阶段 7B 工具。阶段 7B 的 Route、Client、ChatMessage 和测试继续保留，但不参与发芽路径。

---

## 10. 创建碎片流程

采用先保存、后分析：

```text
用户提交
→ 本地校验
→ 写入 Fragment
→ 写入 Plant
→ （图片/语音）写入 MediaAsset
→ 写入 created Event
→ 花园立即显示幼苗，详情立即预览或播放
→ 用户单独同意后执行对应的可选媒体分析/转写
```

文字、链接、图片和语音均先完成本地保存；媒体创建在一个 Dexie 事务中同时写入 Fragment、Plant、MediaAsset 和
`created` Event，不等待 OpenAI，也不因无槽位、未配置 AI 或用户拒绝披露而失败。媒体处理使用同一 MediaAsset 的
`processingRequestId` 做幂等和晚到响应保护。断网、AI、链接或媒体处理失败时，原始内容和植物仍然存在。
思维发芽是用户随后在明确 Fragment 详情中主动发起的独立分析，不是创建碎片的隐式步骤。

---

## 11. AI 接口

通用内容分析和 Embedding Route 仍是历史/后续候选，阶段 10 的图片和语音使用下列独立 Route；创建流程不会隐式调用
OpenAI，新的发芽能力仍必须通过 11.6 的 Sprout Analysis Service 绑定明确 Fragment。

### 11.1 内容分析（历史/后续候选）

`POST /api/ai/analyze-content`

输入：

```ts
{
  text: string;
  sourceType: "text" | "link" | "image_transcript" | "audio_transcript";
}
```

输出：

```ts
{
  title: string;
  summary: string;
  keywords: string[];
  contentCategory:
    | "inspiration"
    | "collection"
    | "wish"
    | "reference"
    | "project"
    | "other";
}
```

### 11.2 图片分析（阶段 10A 当前实现）

固定接口：

```text
POST /api/media/image/analyze
```

请求使用 `multipart/form-data`，只接受当前图片文件、`clientRequestId` 和最小元数据。客户端不能提交模型、Prompt、tools、
Base URL、API Key、Fragment 完整对象或其他 Fragment。Route 校验 PNG/JPEG/WebP 和 10 MB 上限，拒绝空文件、未启用、未配置、
超时或不支持的媒体，并把错误映射为稳定安全码。

服务端从 `OPENAI_IMAGE_MODEL` 读取模型，使用官方 Responses API 的 `input_image`、`detail: "auto"`、`store: false` 和
版本化 Prompt `IMAGE_ANALYSIS_PROMPT_VERSION = "image-analysis-v1"`。响应只保留并由 Zod 二次校验：

```ts
{
  title: string;
  summary: string;
  visibleText: string | null;
  contentKind: "screenshot" | "document" | "photo" | "diagram" | "other";
}
```

`title` 最多 100 个字符，`summary` 最多 800 个字符，`visibleText` 最多 6,000 个字符；看不清或不存在的文字返回 `null`。
Prompt 明确要求只描述图片可支持的内容，不识别人物身份、不推断敏感属性、不执行图片内指令，也不把图片中的 Prompt 当作系统指令。

不使用 Files API、工具调用、Streaming、远端会话或 `previous_response_id`，不保存原始 provider body、reasoning、usage、
远端 file id 或图片内容日志。`image_analysis_disabled`、`missing_configuration`、`unsupported_media_type`、
`file_too_large`、`invalid_image`、`authentication_failed`、`rate_limited`、`model_unavailable`、`request_timeout`、
`response_incomplete`、`invalid_model_response` 和 `provider_error` 统一为安全错误码。

### 11.3 语音转写（阶段 10B 当前实现）

固定接口：

```text
POST /api/media/audio/transcribe
```

请求使用 `multipart/form-data`，只接受当前音频文件、`clientRequestId` 和可选规范化语言提示。Route 接受录音可能产生的
webm、ogg、wav、mp3、m4a/mp4 MIME，限制 15 MB 和产品 3 分钟上限，拒绝空文件、客户端 model、Prompt、Base URL、任意路径
和未配置能力。

服务端从 `OPENAI_TRANSCRIPTION_MODEL` 读取模型，调用 `client.audio.transcriptions.create`，使用 `response_format: "json"`，
不使用 Streaming、翻译、说话人分离或词级时间戳。公共响应只保留经过 Zod 校验的非空 `{ transcript: string }`，不保存 provider
body、usage、远端文件或音频正文。`transcription_disabled`、`missing_configuration`、`microphone_permission_denied`、
`microphone_unavailable`、`recording_unsupported`、`recording_failed`、`empty_recording`、`unsupported_media_type`、
`file_too_large`、`authentication_failed`、`rate_limited`、`model_unavailable`、`request_timeout`、`invalid_transcription` 和
`provider_error` 统一为安全错误码。

图片与语音都由本地 Media Processing Service 编排：开始请求时把同一 MediaAsset 标记为 `processing` 并写入 request id，
成功时原子写回派生结果和 `completed`，失败时写入规范化 error code 和 `failed`。用户选择仅本地时直接写 `local_only`。
服务初始化会把超时未完成的 `processing` 标记为可重试失败，但不自动重新调用 OpenAI；用户标题保护、deleted 检查、当前 request
id 检查和晚到响应丢弃均在本地事务内完成。

### 11.4 Embedding（原阶段 9 候选，暂缓）

`POST /api/ai/embedding`

```ts
{
  embedding: number[];
  model: string;
}
```

### 11.5 真实 AI Chatbot（阶段 7B 当前技术实现，过渡）

`POST /api/companion/respond` 是阶段 7B 保留的开放聊天过渡 Route。请求只允许 `user` / `assistant` 文本消息、
最小 `GardenSummary` 和最多 3 条 `allowedOpenFragments`；客户端不能提交 system/developer 消息、模型、
Prompt、工具定义、API Key、taskId、externalNoteId 或原始数据库对象。公共响应只是一条文本消息或一个
经白名单和 Zod 校验的工具调用，不返回 OpenAI 原始 Response、headers、token 或 reasoning。

服务端调用官方 `client.responses.create`，固定 `store: false`、`parallel_tool_calls: false`、
`tool_choice: "auto"`、45 秒超时和约 600 token 输出上限。模型从服务端 `OPENAI_MODEL` 读取，不能由客户端
指定模型或 Base URL。每回合最多接受一个工具调用；允许的工具只有：

- `recommend_fragment`，执行阶段 6 的确定性推荐 Service；
- `open_fragment`，仅允许打开请求中白名单里的 Fragment；
- `import_link`，复用阶段 7A 的 URL 校验、披露、查重和本地优先导入 Service。

工具调用不会再次自动进入模型循环。客户端执行成功后才写确定性完成消息；失败不会伪造成功。真实模式
必须先取得独立 OpenAI 披露同意，默认模式仍为 local。`openai_disabled`、`missing_configuration`、
`authentication_failed`、`rate_limited`、`model_unavailable`、`request_timeout`、`invalid_model_response`、
`provider_error` 和 `tool_validation_failed` 统一为安全错误码；可恢复的服务错误提供重试或基础模式。

`LocalCompanionResponseEngine` 仍是无网络基础模式，也是配置缺失时的明确降级路径。聊天消息先保存到
本地 IndexedDB，使用 `clientRequestId` 幂等，刷新不会无限重发 pending；不保存 Prompt、Key、reasoning
或远端会话 ID。若链接只有通用标题而无摘要和正文，伙伴只能说明内容不足，不得根据 URL 或平台猜测。

### 11.6 Sprout Analysis Service（阶段 9 当前实现）

思维发芽不是通用 Chat Route，也不是创建碎片时自动触发的后台分析。固定接口为：

```text
POST /api/sprout/analyze
```

Route 只接受一个已由用户明确选中的 Fragment，包括标题、原文、带 `user` / `partner` 来源的补充历史、
链接摘要/原文、生命周期、完成状态、植物阶段，以及最近最多 3 个需避开的临时方向。请求 Schema 全部严格，
拒绝额外字段、deleted 状态、客户端 model、Base URL、Prompt、tools、ChatMessage、taskId、externalNoteId 和
任意 metadata。标题、正文、补充、链接内容和总字符分别受限；确定性上下文最多 16,000 个 Unicode 字符，
优先保留标题、原文和最新用户补充，不发送整个花园或其他 Fragment。

处理顺序固定为：

```text
校验 Fragment 未被删除
→ 本地信息充分性判断
→ 信息不足：返回固定提示，不调用 AI
→ 信息充分且披露已同意：调用独立 OpenAI 发芽 Route
→ strict JSON Schema 与 Zod 双重校验结构化结果
→ 返回一个具体化方向、一个引导问题和一个允许动作
```

服务端只根据 `OPENAI_SPROUT_ENABLED` 判断发芽 AI 是否启用；它不依赖保留的
`OPENAI_COMPANION_ENABLED`。API Key 和 `OPENAI_MODEL` 仅从服务端环境读取，缺少任一配置都不静默切换模型。
官方 `openai` SDK 调用 Responses API，固定 `store: false`、45 秒超时、700 token 输出上限和 strict JSON Schema
Structured Output；不注册任何工具，不使用 function calling、streaming、background mode、Conversation API、
`previous_response_id` 或其他远端会话状态，也不返回 OpenAI raw response、response id、usage、reasoning、
Prompt、headers 或 provider body。SDK 固定 `maxRetries: 0`，避免一个用户回合在 429、5xx 或超时后产生多个
上游调用；Route 将客户端 Request 的 AbortSignal 传给 Responses API，关闭面板可以中止仍在进行的上游请求。

模型输出只能是 `suggestion` 或 `insufficient_content`。suggestion 只包含一个 direction、一个 guidingQuestion
和固定枚举中的一个 recommendedAction；provider 的信息不足 reason 不进入公共响应。服务端在 Schema 之后再次
用 Zod 校验，并拒绝 completed 内容的 `mark_completed`。`sprout_disabled`、`missing_configuration`、
`authentication_failed`、`rate_limited`、`model_unavailable`、`request_timeout`、`response_incomplete`、
`invalid_model_response`、`provider_error`、`content_too_large` 和 `request_validation_failed` 被规范化为固定安全
响应；只有明确 401、`invalid_api_key` 或 provider 认证错误才映射为认证失败。

Fragment 数据始终作为不可信 user 数据与版本化 Developer Prompt 分离，网页正文中的指令不能改变 Prompt 或
输出 Schema。AI 不访问 Dexie 或其他 Fragment，不修改原文、标题或 Plant。客户端只在用户确认后调用本地事务
保存 `partner_suggestion_saved`，并由 Event 派生补充历史中的“伙伴建议”。OpenAI 未配置、超时、限流或响应
无效时显示本地固定引导，不暴露技术堆栈，也不把建议伪装成已生成、已保存或已执行。自动化测试全部使用 SDK、
Route 或 fetch Mock。阶段 9 真实服务验收使用 `gpt-4.1-mini-2025-04-14`，不发送 reasoning 参数并保持
`max_output_tokens = 700`；六次正式请求均完成 strict Structured Output、通过 Zod 且 reasoning tokens 为 0，
空链接由本地规则拦截为 0 次请求。模型仍通过服务端 `OPENAI_MODEL` 配置，不属于前端协议或硬编码能力。

阶段 10 媒体接入不改变发芽 Route 协议：图片上下文只映射当前 MediaAsset 的 `summary`、`visibleText`、`contentKind`、
Fragment 标题和用户补充；音频上下文只映射当前 MediaAsset 的 `transcript`、Fragment 标题和用户补充。只有派生文字或
用户补充满足本地 readiness 时才允许发芽；原始 Blob、MediaAsset id、其他 Fragment 和媒体分析请求体不会发送到
`/api/sprout/analyze`，也不会在每次发芽时重复调用媒体 Route。

---

## 12. 相似碎片（后续待重新规划）

本节保留原设计作为候选，不属于校准后的当前 MVP 或下一步默认任务。是否实现 Embedding、相似度和花丛，
需在伙伴 NPC 与思维发芽闭环稳定后重新评估。

标准文本由以下内容构成：

```text
标题 + AI 摘要 + 原始文字 + 图片提取文字 + 语音转写
```

流程：

1. 生成 Embedding；
2. 本地读取已有向量；
3. 计算余弦相似度；
4. 过滤阈值；
5. 返回最多三条；
6. 对候选生成关联解释。

配置：

```ts
SIMILARITY_THRESHOLD = 0.78;
MAX_SIMILAR_RESULTS = 3;
```

---

## 13. 链接导入与 GetNoteConnector

### 13.1 本地优先流程

阶段 7A 不等待第三方成功才种植物：

```text
首次第三方处理说明并获得同意
→ 校验与规范化 URL
→ 单一 Dexie 事务创建 Fragment + Plant + created Event + ExternalLinkImport
→ 卡片和植物立即出现
→ 提交 GetNote
→ 轮询并写回，或保留本地内容并显示失败
```

`createLocalLinkFragment` 只进行本地写入，不调用 fetch。链接 Fragment 初始为
`contentType = link`、`analysisStatus = pending`，Plant 使用第一个空闲槽，满槽时以
`slotId = null` 成功保存。GetNote 成功后在事务中写入标题、摘要、提取正文和导入终态；如果用户
提供或处理中手工修改过标题或正文，不用第三方对应字段覆盖。标题和正文分别判断，因此用户只补正文
时仍可采用第三方标题。读取完成本身不新增成长事件或成长分。

URL 只允许 HTTP/HTTPS，拒绝 credentials、localhost、`home.arpa`、单标签本地主机、私有或明显
保留的 IPv4/IPv6（含 IPv4 嵌入和隧道形式），长度上限为 2048。规范化只删除 fragment、默认端口、
无意义尾斜杠和明确的
`utm_*`、`fbclid`、`gclid`，保留未知及平台分享参数。重复链接在事务内再次检查；用户可打开已有
碎片、明确再种一棵或取消，`normalizedUrl` 因此不能是唯一索引。

表单与阶段 7B 过渡层的伙伴 `IMPORT_LINK` Action 共用以上披露、查重、本地创建和异步导入流程，不维护
两套业务规则。阶段 8 NPC 不提供自由链接输入，NPC 菜单本身不会触发 GetNote；用户从“种下新想法”进入
现有链接表单并同意披露后，仍按阶段 7A 启动 GetNote。旧回复引擎只识别 Action，不直接访问 Dexie、Route
Handler 或 GetNote。

### 13.2 服务端连接器

浏览器只访问两个固定 Route Handlers：

- `POST /api/link-imports/start`
- `POST /api/link-imports/progress`

服务端 `server-only` GetNoteConnector 的 Base URL 固定为 `https://openapi.biji.com`，只开放三项能力：

- `POST /open/api/v1/resource/note/save`
- `POST /open/api/v1/resource/note/task/progress`
- `GET /open/api/v1/resource/note/detail?id=...`

连接器不是通用代理，不支持搜索、列表、更新、删除、知识库、标签或任意 path。鉴权只从服务端环境
读取 `GETNOTE_API_KEY` 与 `GETNOTE_CLIENT_ID`，分别放入 `Authorization` 与 `X-Client-ID`；
`GETNOTE_LINK_IMPORT_ENABLED` 不为 `true` 或配置不完整时返回 `service_unavailable`。这些变量没有
`NEXT_PUBLIC_` 前缀，也不会返回客户端。

每次上游请求使用 30 秒 AbortController 超时，响应体限制为 2 MB；Route 请求体限制为 8 KB，且只
接受 `application/json`，避免跨站页面通过简单 POST 借用本机共享 Key。
输入、输出和上游响应均经过 Zod 校验。`id`、`note_id`、`parent_id`、`follow_id` 和 `live_id` 在
JSON.parse 前按字符串保护，避免 int64 精度丢失。客户端只收到裁剪后的 title、summary、
sourceContent、canonicalUrl、externalNoteId、truncated 与 requestId，不收到鉴权信息或完整上游对象。

### 13.3 轮询、恢复与失败

ExternalLinkImportManager 使用可取消的递归 `setTimeout`，不用永久 `setInterval`：

- 默认每 10 秒轮询；
- 从第一次开始最多处理 10 分钟，截止时中止活动请求并忽略迟到结果；
- 单个页面运行时最多同时处理 2 个任务；
- 同一 fragmentId 在单个 manager 内只排队一次，并通过以数据库名和 fragmentId 命名的浏览器
  Web Lock 在多个 manager 或标签页之间保持互斥；
- 页面重建时恢复 `pending` / `processing`，浏览器重新在线时继续；
- 组件卸载时取消定时器与请求。

浏览器支持 Web Locks 时使用 origin 范围的 exclusive lock；不支持时使用模块级可取消 FIFO mutex，
至少保证同一 JavaScript 运行时内的多个 manager 互斥。取得锁后必须重新读取 IndexedDB，已终止的任务
直接退出。等待锁的 manager 被销毁时会从队列移除，不会遗留活动任务。

准备提交只推进 `attemptGeneration`，紧邻实际 `start` 请求时才增加 `attemptCount` 并记录
`startedAt`；在取得 GetNote `taskId` 前保持 `pending`，保存 `taskId` 后才进入 `processing`。因此刷新
或 HMR 中断 start 请求后，可以使用剩余的第二次 attempt 恢复，而不会把
`processing + taskId = null` 误判成不可恢复终态。刷新恢复既遵守 `lastPolledAt` 的剩余间隔，也不会
让同一 manager 的正常轮询重复等待。

轮询、完成和失败都携带 `{ attemptGeneration, taskId }` 身份。若记录已经 completed、failed，或身份
与当前记录不一致，事务返回 `didFinalize = false` 且不修改 Fragment、导入记录或伙伴消息；manager
也只在 `didFinalize = true` 时发送 UI 终态事件。

只有 GetNote 明确返回 `provider_processing_failed` 时才自动重新提交一次，因此一次自动流程最多
2 次 attempt；网络、配置、会员、限流、额度、超时和未知错误不会无限快速重试。第二次显式失败后停止。
用户点击“重新读取”会显式重置同一 ExternalLinkImport，再开始新的手动流程，不创建重复 Fragment
或 Plant。

任何失败都会保留 Fragment、Plant、原始 URL 和手工内容，并把 Fragment 与 ExternalLinkImport
在同一事务中标记为 failed。完成与失败伙伴消息和终态标记也在同一事务中写入，避免刷新后重复通知。
`Fragment.sourceUrl` 保留用户最初输入；安全 canonical URL 单独保存在 ExternalLinkImport。
软删除会在删除事务内把尚未完成的 ExternalLinkImport 标为 failed；恢复或在线事件不会再首次发送
该 URL，迟到结果也不能覆盖已删除内容或生成伙伴通知。

### 13.4 部署与验证边界

当前共享 API Key 只适用于本地或有访问保护的少量受控用户。没有登录和服务端访问控制时，不能把
上述 Route Handlers 公开暴露到互联网。链接内容会由 GetNote 处理并在账号中创建远端笔记副本；
当前不会自动删除远端副本。

普通自动化测试全部使用 Mock，不访问真实 GetNote。代码与 Mock 流程通过不代表真实账号会员、额度、
普通网页、小红书或抖音链接已经实测成功；真实 Key 验证必须在项目拥有者本地配置后单独执行，且不能
把 Key 输出到终端、日志或聊天。

---

## 14. 导入导出

导出文件：

```text
fragment-garden-backup-YYYY-MM-DD.json
```

包含：

- 所有 Dexie 表；
- Blob 附件；
- 数据库版本；
- 导出时间。

导入流程：

1. 校验文件；
2. 校验版本；
3. Zod 校验；
4. 用户确认；
5. 在事务内清空并恢复；
6. 失败回滚。

MVP 只支持完整覆盖恢复，不做复杂合并。

---

## 15. 错误处理

### AI 失败

- 不删除碎片；
- 显示重新分析；
- 允许手动编辑。

思维发芽的 AI 失败不应让 NPC 消失或阻止详情访问。服务返回固定的本地基础提示，保留临时建议为空，
并允许用户补充内容或稍后重试；不得把失败伪装成已生成或已保存建议。

### 链接失败

- 保留已经本地保存的 Fragment、Plant、原始 URL 和手工内容；
- 明确区分本地保存失败与 GetNote 读取失败；
- 保存安全错误码与用户可读消息，不保存 Key、请求头或上游堆栈；
- 提供手动重试、打开原链接和手动补充。

### Phaser 失败

- 自动保留卡片模式；
- 提供重新加载花园；
- 动态 import、初始化或场景更新失败时销毁半初始化实例，不留下空白 Canvas；
- 花园数据摘要和本地碎片不被修改。

### 移动失败

- 普通地面失败显示轻量状态，不打开详情；
- 植物目标失败时发出带 plant id 的 `MOVEMENT_FAILED`；
- React 仍调用正常 viewed 记录并直接打开共用详情；
- 目标植物已删除或映射失效时不打开其他内容。

### 本地存储失败

- 明确提示；
- 不假装保存成功；
- 建议删除附件或导出数据。

---

## 16. 测试

### 16.1 单元测试

以下已完成或保留为阶段 1 至 7B 的技术测试事实：

- 成长分；
- 阶段映射；
- 三天休眠；
- 完成后不休眠；
- 每日同类事件去重；
- 槽位分配；
- URL 安全校验、规范化与重复检测；
- V2 到 V3 迁移和 ExternalLinkImport 事务回滚；
- GetNote 固定客户端、int64、超时、错误映射与响应裁剪；
- 轮询间隔、并发、恢复、自动/手动重试和终态通知防重；
- `buildCompanionContext` 的消息、字符、花园摘要和允许打开列表边界；
- Responses API 的 `store: false`、严格工具、单工具限制、模型错误和安全响应；
- 本地与 OpenAI 模式切换、披露、幂等 request id、失败降级和刷新恢复；
- 余弦相似度；
- 推荐去重；
- 备份校验。

阶段 8 的当前测试已覆盖：固定 NPC 首屏与“更多”选项、有限状态转换、花园统计模板、休眠列表排序/上限、
确定性推荐、共享详情打开、猫狗一致性，以及 NPC 菜单路径不会请求 OpenAI、GetNote 或
`/api/companion/respond`；链接创建表单的 GetNote 请求仍由独立的 7A Mock 流程覆盖。

阶段 9 新增的思维发芽单元测试覆盖：

- active、dormant、completed、archived、无槽位和 deleted 的领域与保存边界；
- 本地信息充分性判断、空内容固定提示和不调用 AI 的路径；
- 结构化单方向建议、用户确认保存、`partner_suggestion_saved` 每日去重和各生命周期状态；
- 16,000 字符上下文、Prompt injection 数据边界、strict Structured Output 和安全错误响应；
- OpenAI 不可用时的本地发芽降级，不把技术错误或未执行动作伪装成成功。所有 OpenAI Client 和 Route
  测试使用 Mock，不发起真实 provider 请求。

阶段 10 新增的媒体单元测试覆盖：

- V3 → V4 迁移、旧数据保留、MediaAsset Blob 保存、一个 Fragment 一个主要媒体和事务回滚；
- 图片 MIME/解码/大小校验、状态转换、标题保护、local-only、request id 竞态、删除后的晚到响应和 Blob URL 清理；
- 图片 Route 的 feature flag、配置、multipart、`input_image`、`store: false`、strict Schema、Zod 二次校验和安全错误映射；
- MediaRecorder 状态机、权限拒绝、取消、最大时长、空录音、track/计时器/监听器清理和 Strict Mode；
- 音频 Route 的 MIME/大小校验、JSON 转写、空转写、超时、限流、模型错误和 API Key 不泄露；
- 转写原文与编辑版本、临时标题保护、重转写确认、deleted/archived 边界和不增加成长分；
- 图片/语音披露独立保存，发芽只接收派生文字或用户补充，不发送原始 Blob 或其他 Fragment。

### 16.2 E2E

以下已完成或保留为阶段 1 至 7B 的技术 E2E 事实：

1. 选择伙伴；
2. 创建文字碎片；
3. 出现幼苗；
4. 点击地面后人物移动；
5. 连续点击采用最后目标；
6. 点击植物并在到达后打开正确详情；
7. 可访问植物列表直接打开同一详情；
8. 水池阻止移动；
9. 模式切换后仍只有一个 Canvas；
10. 删除后植物同步消失；
11. 切换卡片模式；
12. 打开并补充；
13. 植物成长；
14. 刷新后数据存在；
15. 链接本地先保存后异步完成；
16. 链接失败、自动重试一次和手动重试；
17. 伙伴 `IMPORT_LINK` 复用同一详情且通知不重复；
18. 导出并恢复。

阶段 8 E2E 已覆盖点击伙伴只出现固定选项、推荐/近况/休眠/规则说明由本地 Action 完成、猫狗菜单一致、
键盘打开休眠内容、刷新持久化和 Canvas 单实例。阶段 9 E2E 验收范围包括从详情发起发芽、信息不足时不调用
AI、用户确认后才保存建议，以及 AI 不可用时本地发芽降级仍可用；自动化必须使用 Route Mock。

阶段 10 E2E 使用浏览器文件、剪贴板和受控 MediaRecorder 替身覆盖图片本地先保存、独立披露、分析失败重试、刷新恢复、
语音权限/取消/播放/转写/编辑/重试，以及图片和语音进入思维发芽时不发送原始媒体。自动化仍只使用 OpenAI/GetNote Mock，
真实图片和真实麦克风冒烟与自动化分开。

GetNote 和真实 OpenAI 在自动测试中使用 Route、SDK 或 fetch Mock，避免创建远端笔记、依赖真实账号、
产生费用或引入平台波动。真实 AI 冒烟测试不属于自动化测试。

---

## 17. 开发顺序与重新规划状态

当前实现顺序已经推进到阶段 10；10A/10B 的代码、自动化测试和构建已完成，真实图片与真实麦克风冒烟仍待人工验收：

1. 项目初始化与 Dexie；
2. 文字碎片和卡片模式；
3. 固定花园和植物显示；
4. 鼠标移动与植物交互；
5. 成长、休眠、完成和新想法；
6. 猫狗选择与 Chatbot 外壳；
7. 7A GetNote 链接导入；7B 受限真实 AI 花园伙伴；
8. 规则型 NPC 固定对话与本地花园 Action；
9. 绑定单个 Fragment 的思维发芽、独立披露、结构化 AI 建议与确认保存。
10. 图片本地媒体基础与分析、语音录制与转写；两者均先保存原始媒体，再由用户单独同意 AI 处理。

阶段 7B 验证了服务端 AI、安全边界、受限工具和本地持久化能力；产品验证后已将伙伴定位校准为规则型
NPC。阶段 8 已隐藏普通用户的开放聊天入口并实现固定对话、固定选项和本地 Action；阶段 7B 的服务层与
持久化代码继续作为过渡基础设施保留。阶段 9 已实现单 Fragment 信息充分性判断、独立 OpenAI 披露、
`/api/sprout/analyze`、结构化建议、换方向和本地确认保存；`partner_suggestion_saved` 已进入既有 Event 表并按
本地日期执行成长去重。阶段 10 已新增 V4 `mediaAssets` 表、图片分析和语音转写 Route、独立披露、状态恢复、手动重试及
发芽派生文本接入；媒体 AI 自动完成不增加成长分。阶段 9/10 自动化不调用真实 OpenAI；阶段 9 独立真实服务冒烟已完成六次受控
请求，验证结构化输出、内容边界、单请求并发、保存幂等和生命周期保持。

Embedding、相似碎片、花丛、云端媒体、正式伙伴移动/像素动画和阶段 11 尚未开始。导入导出已有基础实现，后续只在 MVP
收口/回归需要时再评估增强。每个新阶段仍须先获得明确范围、测试和文档确认。
