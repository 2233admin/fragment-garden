# 碎片花园架构设计 V1.0

## 1. 架构目标

架构需要同时满足：

1. 完成可以真实使用一周的本地 MVP；
2. 花园具有人物移动和植物交互；
3. 文字、链接、图片、语音和 AI 能力可以稳定工作；
4. 后续增加云端账户时，不需要推翻核心业务逻辑。

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
│   ├── Chatbot
│   ├── 图鉴
│   └── 设置与导入导出
│
├── GameBridge
│   └── React 与 Phaser 的唯一通信通道
│
├── Phaser 花园
│   ├── 固定地图
│   ├── 人物鼠标移动
│   ├── 植物显示
│   ├── 猫/狗外观
│   └── 场景交互
│
├── Domain
│   ├── 成长规则
│   ├── 休眠规则
│   ├── 推荐规则
│   ├── 相似度规则
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
    └── 设置

Next.js Route Handlers
├── 内容分析
├── 图片理解
├── 语音转写
├── Embedding
├── Chatbot
└── 链接提取
    ↓
OpenAI API
```

---

## 4. 模块边界

### 4.1 React

负责：

- 页面；
- 表单；
- 弹窗；
- 卡片；
- 搜索与筛选；
- Chatbot 面板；
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
- 相似度阈值；
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
- 后台 AI 分析；
- 相似候选生成；
- 完成与成长；
- 备份恢复。

### 4.6 Route Handlers

负责：

- 隐藏 API Key；
- 链接抓取；
- AI 调用；
- 输入输出校验；
- 超时和错误处理。

服务端接口不得直接修改浏览器数据库。

---

## 5. 推荐目录结构

```text
fragment-garden/
├── app/
│   ├── page.tsx
│   ├── garden/page.tsx
│   ├── api/
│   │   ├── ai/
│   │   │   ├── analyze-content/route.ts
│   │   │   ├── analyze-image/route.ts
│   │   │   ├── transcribe-audio/route.ts
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
│   ├── fragments/
│   ├── growth/
│   ├── plants/
│   ├── similarity/
│   └── recommendations/
│
├── data/
│   ├── db.ts
│   ├── schema.ts
│   ├── migrations.ts
│   └── repositories/
│
├── services/
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
  schemaVersion: number;
};
```

猫和狗只影响外观。

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

### 6.4 FragmentEvent

```ts
type FragmentEventType =
  | "created"
  | "viewed"
  | "reviewed"
  | "text_added"
  | "link_added"
  | "image_added"
  | "audio_added"
  | "next_step_added"
  | "progress_recorded"
  | "cluster_joined"
  | "child_fragment_created"
  | "completed"
  | "restored"
  | "archived";

type FragmentEvent = {
  id: string;
  fragmentId: string;
  type: FragmentEventType;
  payload: Record<string, unknown> | null;
  occurredAt: string;
  ruleVersion: number;
};
```

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
  slotId: string;

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

### 6.9 ChatMessage

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
```

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
| 标记完成 | 直接永久盛开 |

同一种事件同一天最多计算一次成长分。

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

当前时间 - lastInteractedAt >= 3 天
→ lifecycleStatus = dormant
→ vitality = dormant
```

再次互动：

```text
打开详情 / 复盘判断 / 补充内容 / 改变状态
→ lifecycleStatus = active
→ vitality = active
```

休眠采用读取时计算，不依赖后台定时任务。

---

## 8. 固定地图

地图配置：

```ts
type GardenMapConfig = {
  width: number;
  height: number;
  playerSpawn: { x: number; y: number };
  companionPosition: { x: number; y: number };
  walkableAreas: Rectangle[];
  obstacles: Rectangle[];
  plantSlots: PlantSlot[];
};
```

植物槽：

```ts
type PlantSlot = {
  id: string;
  x: number;
  y: number;
  interactionX: number;
  interactionY: number;
};
```

第一版建议预留 36 个槽位。

槽位满时：

- 碎片仍成功保存；
- 植物标记暂未放置；
- 卡片模式仍可用；
- 不因地图容量丢失内容。

---

## 9. GameBridge

### 9.1 React → Phaser

```ts
type ReactToGameEvent =
  | { type: "LOAD_GARDEN"; plants: PlantViewModel[] }
  | { type: "ADD_PLANT"; plant: PlantViewModel }
  | { type: "UPDATE_PLANT"; plant: PlantViewModel }
  | { type: "REMOVE_PLANT"; plantId: string }
  | { type: "FOCUS_PLANT"; plantId: string }
  | { type: "SET_COMPANION"; companion: "cat" | "dog" };
```

### 9.2 Phaser → React

```ts
type GameToReactEvent =
  | { type: "PLANT_CLICKED"; plantId: string }
  | { type: "PLAYER_REACHED_PLANT"; plantId: string }
  | { type: "COMPANION_CLICKED" }
  | { type: "MOVEMENT_FAILED"; targetId?: string };
```

点击植物流程：

```text
点击植物
→ Phaser 控制人物移动
→ 到达 interaction point
→ 发出 PLAYER_REACHED_PLANT
→ React 查询 Dexie
→ 打开 Fragment Drawer
```

---

## 10. 创建碎片流程

采用先保存、后分析：

```text
用户提交
→ 本地校验
→ 写入 Fragment
→ 写入 Plant
→ 写入 created Event
→ 花园立即显示幼苗
→ 后台调用 AI
→ 写入标题、摘要、关键词和 Embedding
→ 本地计算相似度
→ 生成 suggested relation
```

断网、AI、链接或图片处理失败时，碎片和植物仍然存在。

---

## 11. AI 接口

### 11.1 内容分析

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

### 11.2 图片分析

`POST /api/ai/analyze-image`

```ts
{
  description: string;
  extractedText: string;
  summary: string;
  keywords: string[];
}
```

### 11.3 语音转写

`POST /api/ai/transcribe-audio`

```ts
{
  transcript: string;
}
```

### 11.4 Embedding

`POST /api/ai/embedding`

```ts
{
  embedding: number[];
  model: string;
}
```

### 11.5 Chatbot

`POST /api/ai/chat`

请求只包含：

- 当前问题；
- 最近少量聊天；
- 本地检索出的最多 5 条碎片；
- 当前推荐；
- 必要的花园状态摘要。

返回：

```ts
{
  message: string;
  suggestedActions: Array<{
    type:
      | "open_fragment"
      | "show_similarity"
      | "explain_growth"
      | "none";
    fragmentId?: string;
  }>;
}
```

Chatbot 只能建议动作，不能直接写数据库。

---

## 12. 相似碎片

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

## 13. 链接提取

`POST /api/link-preview`

流程：

1. 校验 URL；
2. 仅允许 HTTP/HTTPS；
3. 拒绝 localhost 和内网地址；
4. 设置 8 秒超时；
5. 最大响应体 2 MB；
6. 获取 HTML；
7. 使用 Cheerio 提取 title、description、OG 信息和有限正文；
8. AI 生成摘要；
9. 失败时返回可保存的原始 URL。

服务端不得执行页面脚本，也不得下载外部资源。

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

### 链接失败

- 保存原始 URL；
- 允许手动补充。

### Phaser 失败

- 自动保留卡片模式；
- 提供重新加载花园。

### 移动失败

- 直接打开详情，不让寻路成为门槛。

### 本地存储失败

- 明确提示；
- 不假装保存成功；
- 建议删除附件或导出数据。

---

## 16. 测试

### 16.1 单元测试

覆盖：

- 成长分；
- 阶段映射；
- 三天休眠；
- 完成后不休眠；
- 每日同类事件去重；
- 槽位分配；
- 余弦相似度；
- 推荐去重；
- 备份校验。

### 16.2 E2E

覆盖：

1. 选择伙伴；
2. 创建文字碎片；
3. 出现幼苗；
4. 切换卡片模式；
5. 打开并补充；
6. 植物成长；
7. 刷新后数据存在；
8. 导出并恢复。

真实 AI 在自动测试中使用 Mock，避免不稳定和费用。

---

## 17. 开发顺序

1. 项目初始化与 Dexie；
2. 文字碎片和卡片模式；
3. 固定花园和植物显示；
4. 鼠标移动与植物交互；
5. 成长、休眠、完成和新想法；
6. 猫狗选择与 Chatbot 外壳；
7. 链接提取与内容分析；
8. 图片与语音；
9. 相似碎片与花丛；
10. 导入导出与完整回归测试。

每阶段完成后必须测试并创建 Git commit。
