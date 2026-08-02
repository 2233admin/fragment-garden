# 碎片宇宙技术架构

## 1. 架构目标

碎片宇宙采用本地优先的 Next.js Web 架构。React 管理产品界面与本地数据流，Three.js 管理单一星空 Canvas，Dexie 管理浏览器 IndexedDB，Next.js Route Handlers 隔离 GetNote 与 OpenAI 凭证。

```text
React UI
  ↓ 受限 ViewModel / fragmentId
Domain pure functions ──→ Three.js runtime
  ↓
Service / Repository
  ↓
Dexie / IndexedDB

React UI ──→ Next.js Route Handlers ──→ GetNote / OpenAI
```

渲染层不读取数据库和正文；Provider 不直接写数据库；UI 不复制稳定坐标、亮度和转速规则。

## 2. 技术栈

- Next.js App Router、React、TypeScript strict
- Tailwind CSS 与项目内 CSS
- Three.js、OrbitControls、EffectComposer、UnrealBloomPass
- Dexie、dexie-react-hooks、dexie-export-import
- Zod
- Vitest、fake-indexeddb、Playwright
- OpenAI SDK 与 GetNote HTTP API

Three.js 通过 npm 依赖加载，不使用 CDN、React Three Fiber 或其他 3D 框架。

## 3. 目录职责

```text
app/
  api/                       Provider Route Handlers
  universe/                  产品主入口
components/
  starmap/                   星空挂载、Dock、星旁摘要与完整详情
  fragments/                 创建、阅读、追加与媒体展示
  content-processing/        链接/图片任务与等待态
  backup/                    导出、预检和恢复
data/
  repositories/              表级访问
  queries/                   组合只读查询
domain/
  stars/                     Fragment → StarViewModel 纯投影
  fragments/                 正文与标题规则
services/                    事务与 Provider 客户端编排
starmap/runtime/             Three.js 生命周期与渲染
validation/                  Route 与业务输入输出 Schema
tests/                       单元与端到端回归
```

数据库中保留的兼容表和稳定存储标识不会进入星空事实来源，也不会在普通 UI 中暴露。它们不能在没有独立迁移与恢复验证的情况下删除或改名。

## 4. 领域模型

### Fragment

正式内容记录。关键字段包括：

- `id`: UUID，也是内容星 ID；
- `contentType`: text、link、image 或兼容类型；
- `title`: 可访问名称与索引标题；
- `contentMarkdown`: 原始正文或校验后的内容主体；
- `lifecycleStatus`: 包含 deleted 等兼容状态；
- `createdAt`、`updatedAt`、`lastInteractedAt`: ISO 字符串。

只有非 deleted 的正式 Fragment 才进入星空投影。

### FragmentNote

独立用户追加。正文与创建时间独立保存，编辑已有 Note 不改变追加数量。当前有效 Note 数量是内容星亮度的事实来源。

### ContentProcessingJob

链接和图片的延迟创建任务。任务可处于 pending、processing、failed 或 completed。任务成功前没有正式 Fragment 和内容星；图片 Blob 在任务阶段临时保存，成功后移动到唯一主 MediaAsset。

### MediaAsset

保存图片或兼容媒体 Blob、MIME、大小、处理状态与派生结果。原始 Blob 不使用 Base64 长字符串。

## 5. 数据库与迁移

Dexie 数据库当前为版本 5。Schema 注册必须显式版本化；已发布版本不得事后追加 store。V5 同时注册 `fragmentNotes` 与 `contentProcessingJobs`。

Repository 与 Service 是数据库唯一写入口。UI、Three.js 和 Route Handler 都不得散落调用 Dexie。

完整备份从当前 Schema 的表名集合派生，防止新增表被静默遗漏。恢复流程先解析和预检，再在明确确认后覆盖；恢复完成后由 live query 生成一次完整稳定快照，不逐颗误播创建动画。

## 6. 内容星投影

`queryStarMapSnapshot` 批量读取非 deleted Fragment 与对应 FragmentNote 数量，再调用 `domain/stars/star-view-model.ts` 生成排序稳定的 `StarViewModel[]`。

坐标由 `fragmentId + layoutVersion` 的确定性哈希派生。系统不新增 Star 表，也不持久化位置、颜色、亮度、尺寸或旋转速度。

亮度使用有上限的饱和映射：第一次追加可见，后续增长逐渐收敛。颜色由 Fragment ID 从受限视觉调色板确定性选择，不代表语义或重要度。

转速同样使用有上限的饱和映射：

```text
speed = min + (max - min) × (1 - exp(-contentStarCount / 32))
```

## 7. Three.js runtime

### 初始化

1. React 动态加载 runtime。
2. runtime 创建 Scene、PerspectiveCamera、WebGLRenderer 与 EffectComposer。
3. 生成固定种子的环境星 Points。
4. 创建内容星单一 Points BufferGeometry 与 ShaderMaterial。
5. 注册 ResizeObserver、指针、visibility、reduced-motion 与 OrbitControls 监听。
6. 启动唯一 RAF。

### 渲染

- 环境星按远景、中景和 beacon 分层批量渲染。
- 内容星共用一个 Points buffer 与 ShaderMaterial，不为每颗星创建 Sphere Mesh。
- Fragment shader 绘制白色星核、彩色内盘、halo 与外圈微光。
- 后处理链为 `RenderPass → UnrealBloomPass → OutputPass`。
- renderer 与 composer 的 DPR 上限均为 2。

### 点击

- 只对内容星做命中检测。
- pointer move 与 click 时检测，不在每帧全量 raycast。
- 命中容差为 18 CSS px。
- 位移超过阈值视为拖拽，不触发点击。
- runtime 只向 React 返回 `fragmentId`；React 再次确认 Fragment 存在且未删除。

### 清理

卸载或初始化失败时必须取消 RAF、断开 ResizeObserver、移除监听，并 dispose controls、passes、composer、geometry、material、texture、render target 与 renderer。随后主动释放 WebGL context、清空映射并移除 Canvas。`destroy()` 可重复调用且不会抛错。

## 8. React 与 runtime 合约

```ts
type MemoryStarmapRuntime = {
  getStarScreenPosition(fragmentId: string): { clientX: number; clientY: number } | null;
  setStars(stars: readonly StarViewModel[]): void;
  setRotationSpeed(radiansPerSecond: number): void;
  setSelectedStar(fragmentId: string | null): void;
  setDetailOpen(isOpen: boolean): void;
  setStarLaunchActive(fragmentId: string | null): void;
  setReducedMotion(isReducedMotion: boolean): void;
  destroy(): void;
};
```

React 不接收逐帧位置。屏幕坐标只在创建交接、打开详情、resize 和收起详情时按需查询。

## 9. 创建链路

### 文字

```text
本地校验 → 原子创建 Fragment → live query 新快照
→ runtime 暂时隐藏目标正式星 → 保存按钮形变并飞向目标坐标
→ runtime 显示同一个真实内容星
```

### 链接与图片

```text
本地校验与独立披露 → 创建 ContentProcessingJob
→ 前台黑洞等待态或转入后台 → Route Handler 调用 Provider
→ Zod 校验 → 原子创建 Fragment（图片同时创建 MediaAsset）
→ job completed → 过渡落到真实内容星
```

失败只更新 job，不创建 Fragment 或内容星。

## 10. Provider 边界

### GetNote

链接客户端只提交提取并校验后的公网 URL。Route Handler 负责鉴权、轮询、超时和错误映射。需要 `GETNOTE_API_KEY`、`GETNOTE_CLIENT_ID` 与 `GETNOTE_LINK_IMPORT_ENABLED`。

### OpenAI 图片分析

客户端提交经过类型和大小校验的单张图片。Route Handler 使用 Responses API、strict structured output 与 Zod 生成简体中文标题和 Markdown。需要 `OPENAI_API_KEY`、`OPENAI_IMAGE_ANALYSIS_ENABLED` 与 `OPENAI_IMAGE_MODEL`。

所有 Key 只存在于服务端环境变量。真实 Provider 不进入自动化测试。

## 11. 可访问性与降级

- 所有对话框提供可访问名称、关闭路径与焦点恢复。
- 紧凑星旁摘要不是 modal；点击空白可关闭。
- 完整详情使用 modal、焦点圈定与 Escape 关闭。
- reduced motion 停止自动旋转、脉冲与形变，保留静态反馈。
- WebGL 初始化失败时清理半初始化资源并显示静态降级。
- 内容、设置和备份入口不能依赖 Canvas 成功。

## 12. 测试策略

优先覆盖：

- Fragment 到内容星的稳定投影；
- FragmentNote 数量到亮度的有界映射；
- 内容星数量到转速的有界映射；
- 单 Canvas、Strict Mode、resize、visibility 与资源销毁；
- 点击星星打开正确 Fragment；
- compact → expanded → collapse → close 过渡；
- 文字、链接、图片的成功与失败边界；
- processing job 前台/后台同步；
- 备份导出、预检、恢复与稳定坐标。

单元测试使用 fake-indexeddb，E2E 使用 Playwright，Provider 使用 Mock。
