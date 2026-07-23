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
│   ├── movement/
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
  | "archived"
  | "deleted";

type TextAddedEventPayload = {
  text: string;
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

`text_added` 事件的 `payload` 必须符合 `TextAddedEventPayload`。读取历史数据时先进行运行时校验，不允许产品界面直接假设任意 `Record` 一定包含 `text`。

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

`companionPosition` 仅为后续阶段保留，不渲染猫或狗。

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
  | { type: "CANCEL_INTERACTION" };
```

每个 `GardenCanvas` 创建独立 Bridge 实例。React 的 live query 初次和后续变化都发送完整 `LOAD_GARDEN`；`GardenScene` 按 `plantId` 做确定性新增、更新和移除。Bridge 不访问 Dexie 或 React state，场景关闭时取消订阅，组件清理时销毁实例。

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
    };
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

### 9.3 Canvas 生命周期

Phaser 只在 `GardenCanvas` 的客户端 effect 中动态加载。切换到卡片模式时，React Activity 保留卡片搜索、排序和创建状态，同时销毁 Phaser Game、输入监听、路线、Bridge 和 Canvas。返回花园时使用最新快照重建单个 Canvas，人物一致地回到出生点，旧交互目标不会继续。

异步 import 使用取消标记，避免 Strict Mode 或 HMR 留下孤立 Canvas。同一页面最多存在一个 Canvas。测试诊断属性由 GameBridge 的低频状态转换事件更新，只暴露人物坐标、移动状态和选中 plant id，不包含正文或附件，产品逻辑不依赖这些属性。

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
15. 导出并恢复。

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
