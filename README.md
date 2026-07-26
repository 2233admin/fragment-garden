# 碎片花园（Fragment Garden）

碎片花园是一座由个人灵感、收藏、愿望和半成品生长而成的私人花园。

用户可以把“现在不想处理，但也不想忘记”的内容种进花园。每条碎片会成为一株植物；当用户重新回看、补充或推动它进入现实，植物会继续生长。产品的核心循环是：

> 碎片让花园变美，花园让碎片重新被看见。

## 当前阶段

当前目标是完成一个仅供本人使用和演示的桌面端本地 Web MVP。

它不是正式商业产品，也不是纯视觉 Demo。第一版应当能够连续真实使用一周，并验证：

1. 把碎片变成植物，是否能提升记录时的满足感；
2. 花园是否能促使用户重新进入产品；
3. 用户是否会回看过去保存的内容；
4. 回看后是否会产生补充、关联、行动或新的想法。

阶段 7A～10 已完成链接读取、规则型 NPC、旧版思维发芽和图片理解等技术闭环。当前正在按新的 MVP
产品边界连续实施阶段 11～13：卡片改为内容型笔记，链接和图片只在处理成功后创建正式卡片，思维发芽
改为生成一篇可预览、可编辑的新笔记，并在用户确认后创建新卡片和植物。卡片负责承载内容，花园负责
表现生命周期与成长状态；普通详情不再承担系统后台职责。

语音录制、audio MediaAsset、转写 Route、转写编辑和自动化测试等技术基础继续保留，但真实语音链路尚未
稳定通过；普通 MVP 隐藏新建语音和重新转写入口，后续作为 Post-MVP / Experimental 能力重新验证。阶段 7B
开放聊天和阶段 9 伙伴建议也仅作为不可见的历史技术实现保留。阶段 14 才处理备份、恢复、稳定性和 MVP
封版；Embedding、相似碎片、花丛、云同步和伙伴动画不在当前范围。

## 第一版能力范围（当前实现与目标）

- 当前 MVP 输入为文字、链接和图片：文字立即创建正式卡片；链接和图片先创建可恢复的本地处理任务，
  处理成功后才原子创建正式 Fragment、Plant，以及图片对应的 MediaAsset；
- 新碎片先生成一株统一幼苗；
- 链接由受限 GetNoteConnector 异步读取，失败时保留原始 URL 和本地内容；
- 用户可在固定花园地图中通过鼠标点击移动人物；
- 点击植物后，人物靠近植物并打开对应碎片；
- 支持卡片模式，用于搜索、筛选和直接查看内容；
- 支持植物成长、三天休眠、恢复、封存、删除和永久盛开；
- 支持“让它长成一个新想法”，保留来源关系；
- 用户首次进入时从猫或狗中选择一个唯一花园伙伴；
- 猫和狗仅外观不同，能力、语气和逻辑完全一致；
- 阶段 8 已实现功能型规则 NPC，通过固定台词和固定选项帮助用户理解、记录和回看花园；它提供花园近况、
  休眠植物列表、确定性旧碎片推荐、规则说明和种下新想法等本地动作；
- 共享 Fragment 详情提供“发芽”：它只使用当前笔记主体、用户追加笔记和必要来源文字，生成一篇新的完整
  Markdown 笔记；结果先预览和编辑，确认后才创建新 Fragment、Plant 与来源关系，原卡片始终不被覆盖；
- 图片支持 PNG、JPEG、WebP（单张、最大 10 MB），可选择文件或从剪贴板粘贴；图片详情使用 Blob URL 预览，
  分析状态和结果保存在本地，并可手动重试；
- 图片分析使用独立披露与固定 Route（`/api/media/image/analyze`），处理失败不会删除 Fragment、Plant 或原始媒体；
- 语音技术基础作为 Post-MVP / Experimental 能力保留：已有 audio Fragment 仍可从卡片和详情读取、播放原始录音、
  查看或编辑已有 transcript，并可在有有效 transcript 或用户补充时进入思维发芽；普通 MVP 不提供新建语音或重新转写入口；
- 阶段 7B 的开放输入、AI/基础模式和三个受限工具目前仍是技术过渡能力，不是校准后的普通用户入口；
- 图片分析不会自动增加成长分或改变植物阶段；保留的语音转写实现也遵守同一边界。Embedding、相似碎片和花丛属于待重新规划的
  后续能力；
- 数据保存在当前浏览器，不提供注册、登录和云端同步；
- 支持本地数据导出与导入。

## 第一版明确不做

- 注册登录、多人使用和云端同步；
- 移动端和系统分享入口；
- WASD、触屏和手柄操作；
- 用户自由移动植物或编辑地图；
- 多张地图、花园扩建、天气和昼夜；
- 正式美术、复杂角色动画和宠物养成；
- 社交、访客、排行榜和内容社区；
- 商店、货币和道具；
- 强制打卡、效率评分和植物死亡；
- 复杂项目管理；
- 面向普通用户的开放式聊天、通用问答和自由工具选择；
- AI 自动修改、删除或合并用户内容；
- 猫狗不同人格或不同功能。

## 目标技术栈

- TypeScript
- Next.js App Router
- React
- Tailwind CSS
- Phaser 3.90.0
- IndexedDB
- Dexie.js
- Next.js Route Handlers
- OpenAI API
- Zod
- Vitest
- Playwright
- npm
- Git

## 核心架构原则

1. React 管理产品界面与用户操作；
2. Phaser 管理花园画面与场景交互；
3. Domain 层管理成长、休眠、推荐与关联规则；
4. Dexie 管理浏览器本地持久化；
5. Route Handlers 管理 AI 与链接提取；
6. GameBridge 是 React 与 Phaser 的唯一通信通道；
7. 文字本地校验后立即保存；链接和图片以本地 processing job 承接第三方处理，只有成功结果才成为正式卡片；
8. 链接、图片或发芽失败只影响临时任务，不得留下空卡片、空植物或修改原卡片；
9. 植物状态由确定性规则计算，不由 AI 决定；
10. 花园交互失败时，卡片模式必须始终可用。

## 链接读取与 GetNote 配置

链接会在用户同意得到大脑（GetNote）披露后创建本地 processing job，而不是立即创建正式 Fragment 或
Plant。任务保存原始 URL、provider task identity、状态和重试信息；成功取得足够正文后，才在一个事务中
创建正式内容型卡片、植物、来源元数据和 created Event。失败、离线或服务未配置时保留任务用于重试或
取消，但卡片列表和花园不会出现空内容。

GetNoteConnector 只在服务端使用固定的 save、progress 和 detail 接口，不提供任意路径代理。配置写入
本机 `.env.local`：

```dotenv
GETNOTE_API_KEY=
GETNOTE_CLIENT_ID=
GETNOTE_LINK_IMPORT_ENABLED=false
```

变量都不能使用 `NEXT_PUBLIC_` 前缀。`GETNOTE_API_KEY` 和 `GETNOTE_CLIENT_ID` 不得进入浏览器
bundle、日志或 Git；`.env.local` 已被忽略。启用时把 `GETNOTE_LINK_IMPORT_ENABLED` 改为 `true`。

当前共享 Key 方案只适用于本地或有访问保护的少量受控用户。项目没有登录或服务端访问控制时，不应把
链接导入 Route Handlers 公开暴露到互联网。GetNote 会创建远端笔记副本，当前不会自动删除；不要提交
不希望由第三方处理的私密链接。清空本地数据会移除披露同意状态，但不会删除已经创建的远端副本。

自动化测试使用 Route 和 fetch Mock，不调用真实 GetNote。本阶段的代码通过 Mock 验证不等同于真实
账号、会员、额度或平台链接已经完成实测；真实验证必须由项目拥有者在本地配置环境变量后手工执行。

## 阶段 7B 过渡实现与阶段 8 当前 NPC

### 当前技术实现（已完成，过渡）

真实 AI 只通过服务端 `POST /api/companion/respond` 调用官方 OpenAI Responses API。API Key、模型配置
和请求细节不会进入浏览器、IndexedDB 或日志；请求固定使用 `store: false`，不使用 OpenAI 远端会话、
`previous_response_id`、流式输出或通用 Agent 循环。模型由服务端 `OPENAI_MODEL` 配置，客户端不能指定
模型、Base URL 或 Prompt。

伙伴只允许三个工具：`recommend_fragment`、`open_fragment` 和 `import_link`。每回合最多执行一个工具，
参数在服务端和客户端分别校验；工具由现有本地服务执行，完成提示来自确定性结果，而不是模型自述。
聊天消息和模式设置以本地 IndexedDB 为事实来源，上下文最多保留最近 20 条有效消息、单条 4,000 字符、
总计 12,000 字符，并只发送最小花园统计和最多 3 条允许打开的碎片元数据。

首次启用 AI 会单独显示第三方处理说明，用户可以同意、取消或继续使用基础模式。OpenAI 未配置、未启用、
超时、限流或模型不可用时，内容仍保留，界面提供重试或基础模式降级；未读取到摘要和正文的链接不会由
模型根据标题或 URL 猜测内容。猫和狗共用同一模型、Prompt、工具和回复逻辑，仅外观不同。

### 阶段 8 当前实现（已完成）

伙伴是花园中的功能型 NPC，也是用户与花园规则互动的入口。当前点击伙伴后显示固定台词和固定选项，
普通用户不再看到开放输入框，也不需要选择 AI/基础模式。首屏选项为“帮我找一株值得重新看看的植物”、
“看看花园近况”、“帮我种下一个新想法”、“更多”和“离开”；“更多”提供休眠植物、成长规则、
休眠/完成/封存说明、只是来看看、返回和离开。台词会使用本地的植物数量、状态和标题等元数据。
推荐、近况、休眠列表和规则说明由确定性 Domain/Service 完成；NPC 菜单不调用 OpenAI、GetNote 或
`/api/companion/respond`。选择“种下新想法”后，链接表单仍按阶段 7A 的独立披露流程处理 GetNote，猫狗只在
外观上不同。

### 阶段 9 当前思维发芽实现（已通过真实服务验收）

“思维发芽”是思维层面的产品术语，不等同于植物视觉阶段的发芽。入口位于共享 Fragment 详情，active、
dormant、completed、archived 和没有花园槽位的内容均可使用，deleted 内容不可使用。流程只读取当前选中的
标题、原文、补充历史、链接摘要/原文和必要状态，不发送整个花园、其他碎片或旧聊天历史。

本地规则会先拦截只有 URL、占位标题或没有可理解内容等明显信息不足的情况，此时不调用 AI。首次把当前
Fragment 发送给 OpenAI 前会显示独立的思维发芽披露；旧聊天披露和 GetNote 披露不能替代它。用户拒绝披露，
或 OpenAI 未配置、超时、限流、模型不可用时，详情和规则型 NPC 仍可使用，并显示固定的本地引导。

AI 增强使用固定 `POST /api/sprout/analyze`、官方 Responses API、服务端模型配置和 `store: false`，通过
strict JSON Schema Structured Output 只返回一个具体化方向、一个引导问题和一个允许动作。不注册工具，
不使用远端会话、`previous_response_id`、Streaming 或 Agent Loop。SDK 自动重试已关闭；关闭发芽面板时，
浏览器取消信号会继续传到服务端的 OpenAI 请求，重试只由用户明确发起。建议在确认前只是临时状态；用户点击
“保存这条建议”后，才以“伙伴建议”来源写入补充历史并记录 `partner_suggestion_saved`。同一 Fragment 按
浏览器本地日期每天最多因此增加一次成长分（+1）；dormant 恢复 active，completed 保持永久盛开，archived
保持封存且不重新占用槽位。AI 不覆盖原文，也不自动执行推荐动作。

阶段 7B 的开放 Chat UI、Route、ChatMessage、OpenAI 服务层和三个受限工具仍保留为不可见的开发调试/过渡
基础设施，不参与普通 NPC 或思维发芽路径。阶段 10 的图片能力已经接入共享创建和详情流程；语音底层实现与历史
内容兼容继续保留，但不参与当前普通创建流程。正式伙伴
移动动画、Embedding、相似碎片和花丛不属于当前阶段。阶段 11 的内容型卡片已经完成，阶段 12 尚未开始。

真实服务验收最终使用服务端 `OPENAI_MODEL` 配置的 `gpt-4.1-mini`（响应快照
`gpt-4.1-mini-2025-04-14`），不发送 reasoning 参数，保持 `max_output_tokens = 700`。正式六次请求均以
strict Structured Output 完成并通过 Zod，HTTP 均为 200，端到端耗时约 2.2～4.6 秒，reasoning tokens 均为
0；空链接在本地拦截，没有额外请求。此前 `gpt-5-mini-2025-08-07` 在相同 700 token 上限下把 640 个输出
token 全部用于 reasoning，只返回 reasoning item、没有 `output_text`，因此被正确规范化为
`response_incomplete`。最终选择无需模型专属 reasoning 参数的非推理配置，而不是扩大 token 上限；模型仍只
由服务端环境配置，未在前端写死。

## 项目文档

- `PRD.md`：完整产品需求、范围和验收场景；
- `ARCHITECTURE.md`：技术架构、模块边界、数据模型和接口；
- `AGENTS.md`：Codex 开发时必须遵守的规则；
- `README.md`：项目概览与开发入口。

## 预计开发方式

开发必须采用小步迭代：

1. 每次只实现一个独立能力；
2. 每完成一个阶段，先运行测试；
3. 确认功能正常后创建 Git commit；
4. 不允许一次性生成整个项目；
5. 文档和代码出现冲突时，先更新文档再继续开发。

## 本地运行

项目初始化完成后，预期使用：

```bash
npm install
npm run dev
```

然后在桌面浏览器中打开本地开发地址。

实际脚本以项目初始化后的 `package.json` 为准。

## MVP 核心体验重构：阶段 11～13

阶段 11 已把正式卡片统一为内容型笔记。Fragment 的主体使用 `contentMarkdown`，阅读界面安全渲染富文本，
编辑界面提供标题与必要格式能力；用户追加内容独立存入 `fragmentNotes`，不再混入系统 Event 或伙伴建议。
卡片列表与详情移除生命周期、成长分、处理状态和系统流水，状态继续只由花园视觉与底层 Domain 使用。
编辑器采用受限 Lexical 节点和 Markdown transformer，原因是它提供稳定的 React 本地编辑能力而不引入协作或
云端体系；阅读使用 `react-markdown`，跳过原始 HTML 并限制 URL 协议。阶段 11 的 `contentProcessingJobs`
仅完成 V5 store 预留，当前保持为空。

阶段 12 将把链接和图片改为延迟创建：披露同意后先写入 V5 `contentProcessingJobs`。链接 job 保存 URL 和
GetNote 任务身份；图片 job 保存临时 Blob。任务不占植物槽位，也不进入卡片列表。成功后才原子创建正式
Fragment、Plant、created Event，图片同时创建 MediaAsset 并移走 job 中的重复 Blob；失败可重试或取消，
不会留下空卡片。

阶段 13 将新增 `POST /api/sprout/generate` 和 `sprout-generate-v1` Prompt。生成输入只包含当前笔记的 Markdown、
所有用户追加笔记、必要来源说明和已有子笔记标题，不发送图片/音频 Blob、其他 Fragment、伙伴建议或生命周期
字段。输出固定为 `{ title, markdown }`，先存入 sprout job 并显示可编辑预览；只有用户点击“确认种下”后，
才原子创建一张普通文字卡片、一株植物和 confirmed `grows_from` 关系。旧 `/api/sprout/analyze`、
`partner_suggestion_saved` 和历史数据继续保留，但普通 UI 不再使用。

图片仍只接受 PNG、JPEG 和 WebP，最大 10 MB；图片披露独立保存，图片 Route 和模型只由服务端配置。
语音继续作为 Post-MVP / Experimental 历史兼容能力。阶段 14 尚未开始，不创建 `mvp-v1` 或其他新 Tag。
